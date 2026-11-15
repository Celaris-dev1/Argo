import { randomBytes } from "node:crypto";
import type { Actor, MessageBlock, RunShare } from "@argo/contracts";
import type { Prisma, PrismaClient } from "@argo/db";
import { IsolationError, runAsSystem } from "@argo/db";
import { listRunActions } from "./runs.js";

const SHAREABLE = ["completed"] as const;
const MAX_TEXT = 6_000;
const ID_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function shareId(): string {
  const bytes = randomBytes(12);
  let id = "";
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

/** Keeps a shared page from leaking addresses or numbers the person did not mean to publish. */
export function redactForSharing(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]")
    .replace(/\b(?:sk|pk|ak|ghp|xox[abp])[-_][A-Za-z0-9_-]{12,}\b/g, "[key]")
    .slice(0, MAX_TEXT);
}

function blocksText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  return (blocks as MessageBlock[])
    .map((block) => (block.kind === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function shareUrl(webOrigin: string, id: string): string {
  return `${webOrigin.replace(/\/$/, "")}/r/${id}`;
}

/** Snapshots one of the caller's finished runs as a public page, or returns the existing one. */
export async function shareRun(
  prisma: PrismaClient,
  actor: Actor,
  runId: string,
): Promise<{ id: string }> {
  const run = await prisma.run.findFirst({
    where: {
      id: runId,
      spaceId: actor.spaceId,
      userId: actor.userId,
      status: { in: [...SHAREABLE] },
    },
    select: {
      id: true,
      threadId: true,
      bot: { select: { name: true } },
      task: { select: { prompt: true } },
      sourceMessage: { select: { blocks: true } },
      share: { select: { id: true } },
    },
  });
  if (!run) throw new IsolationError();
  if (run.share) return { id: run.share.id };
  const reply = await prisma.message.findFirst({
    where: { threadId: run.threadId, runId: run.id, role: "bot" },
    orderBy: { seq: "desc" },
    select: { blocks: true },
  });
  const prompt = redactForSharing(blocksText(run.sourceMessage?.blocks) || run.task?.prompt || "");
  const result = redactForSharing(blocksText(reply?.blocks));
  if (!result) throw new IsolationError();
  const steps = (await listRunActions(prisma, actor, run.id)).map(({ label, outcome }) => ({
    label,
    outcome,
  }));
  const created = await prisma.runShare.create({
    data: {
      id: shareId(),
      runId: run.id,
      spaceId: actor.spaceId,
      userId: actor.userId,
      botName: run.bot.name,
      prompt,
      result,
      steps: steps as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return created;
}

export async function unshareRun(prisma: PrismaClient, actor: Actor, runId: string): Promise<void> {
  await prisma.runShare.deleteMany({
    where: { runId, spaceId: actor.spaceId, userId: actor.userId },
  });
}

/** Anyone with the link may read a share; nothing else about the run or its owner is exposed. */
export async function readPublicShare(prisma: PrismaClient, id: string): Promise<RunShare | null> {
  if (!/^[A-Za-z0-9]{6,32}$/.test(id)) return null;
  const row = await runAsSystem("read a public run share", () =>
    prisma.runShare.findUnique({
      where: { id },
      select: { botName: true, prompt: true, result: true, steps: true, createdAt: true },
    }),
  );
  if (!row) return null;
  return {
    botName: row.botName,
    prompt: row.prompt,
    result: row.result,
    steps: Array.isArray(row.steps) ? (row.steps as RunShare["steps"]) : [],
    createdAt: row.createdAt.toISOString(),
  };
}
