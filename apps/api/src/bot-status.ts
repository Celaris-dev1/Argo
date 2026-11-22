import { randomBytes } from "node:crypto";
import type { Actor, BotStatus } from "@argo/contracts";
import { BotAvatarSetSchema } from "@argo/contracts";
import { WORKING_RUN_STATUSES } from "@argo/core";
import type { PrismaClient } from "@argo/db";
import { IsolationError, runAsSystem } from "@argo/db";
import { redactForSharing } from "./run-shares.js";

const RECENT_TASKS = 20;
const SHARED_RESULTS = 6;
const DESCRIPTION_MAX = 280;
const TITLE_MAX = 80;
const ID_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function statusId(): string {
  let id = "";
  for (const byte of randomBytes(12)) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

export function statusUrl(webOrigin: string, id: string): string {
  return `${webOrigin.replace(/\/$/, "")}/s/${id}`;
}

/** A task's title: the first line of what was asked, redacted and cut short. Never the result. */
export function taskTitle(prompt: string): string {
  const line =
    prompt
      .split("\n")
      .find((part) => part.trim())
      ?.trim() ?? "";
  const clean = redactForSharing(line, 400);
  return clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1).trimEnd()}…` : clean;
}

async function ownBot(prisma: PrismaClient, actor: Actor, botId: string) {
  const bot = await prisma.bot.findFirst({
    where: { id: botId, spaceId: actor.spaceId, userId: actor.userId, archivedAt: null },
    select: { id: true, statusPage: { select: { id: true } } },
  });
  if (!bot) throw new IsolationError();
  return bot;
}

export async function readBotStatusLink(
  prisma: PrismaClient,
  actor: Actor,
  botId: string,
): Promise<string | null> {
  return (await ownBot(prisma, actor, botId)).statusPage?.id ?? null;
}

/** Publishes the owner's bot status page, or returns the one already published. */
export async function publishBotStatus(
  prisma: PrismaClient,
  actor: Actor,
  botId: string,
): Promise<string> {
  const bot = await ownBot(prisma, actor, botId);
  if (bot.statusPage) return bot.statusPage.id;
  const created = await prisma.botStatusPage.create({
    data: { id: statusId(), botId, spaceId: actor.spaceId, userId: actor.userId },
    select: { id: true },
  });
  return created.id;
}

export async function unpublishBotStatus(
  prisma: PrismaClient,
  actor: Actor,
  botId: string,
): Promise<void> {
  await prisma.botStatusPage.deleteMany({
    where: { botId, spaceId: actor.spaceId, userId: actor.userId },
  });
}

/**
 * Anyone with the link sees the bot's name, its description, how many tasks it finished, recent
 * finished task titles and the results its owner already shared publicly; nothing else.
 */
export async function readPublicBotStatus(
  prisma: PrismaClient,
  id: string,
): Promise<BotStatus | null> {
  if (!/^[A-Za-z0-9]{6,32}$/.test(id)) return null;
  return runAsSystem("read a public bot status page", async () => {
    const page = await prisma.botStatusPage.findUnique({
      where: { id },
      select: {
        bot: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true,
            avatarSet: true,
            archivedAt: true,
          },
        },
      },
    });
    if (!page || page.bot.archivedAt) return null;
    const finished = {
      botId: page.bot.id,
      status: "completed" as const,
      completedAt: { not: null },
    };
    const [runs, completed, shares, active] = await Promise.all([
      prisma.run.findMany({
        where: finished,
        orderBy: { completedAt: "desc" },
        take: RECENT_TASKS,
        select: { completedAt: true, task: { select: { prompt: true } } },
      }),
      prisma.run.count({ where: finished }),
      prisma.runShare.findMany({
        where: { run: { botId: page.bot.id } },
        orderBy: { createdAt: "desc" },
        take: SHARED_RESULTS,
        select: { id: true, prompt: true, createdAt: true },
      }),
      prisma.run.count({
        where: { botId: page.bot.id, status: { in: [...WORKING_RUN_STATUSES] } },
      }),
    ]);
    const description = redactForSharing(page.bot.description.trim(), DESCRIPTION_MAX);
    return {
      botName: page.bot.name,
      color: page.bot.color,
      avatarSet: BotAvatarSetSchema.catch("organic").parse(page.bot.avatarSet),
      working: active > 0,
      description,
      completed,
      shared: shares
        .map((share) => ({
          id: share.id,
          title: taskTitle(share.prompt),
          at: share.createdAt.toISOString(),
        }))
        .filter((share) => share.title),
      tasks: runs
        .map((run) => ({
          title: taskTitle(run.task?.prompt ?? ""),
          at: run.completedAt!.toISOString(),
        }))
        .filter((task) => task.title),
    };
  });
}
