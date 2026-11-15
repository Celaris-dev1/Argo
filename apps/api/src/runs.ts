import type { Actor, RunAction, RunActivityRow } from "@argo/contracts";
import { MessageBlock } from "@argo/contracts";
import {
  ACTIVE_RUN_STATUSES,
  BACKGROUND_RUN_TRIGGERS,
  botMessageContext,
  displayName,
  truncatePlainText,
} from "@argo/core";
import type { PrismaClient } from "@argo/db";
import { IsolationError, runAsSystem } from "@argo/db";

const RECENT_LIMIT = 20;
const TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const;

function promptSnippet(prompt: string, max = 120): string {
  const oneLine = prompt.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${truncatePlainText(oneLine, max - 1)}…`;
}

export function activityPreview(
  input: { trigger: string; prompt: string; sourceBlocks?: unknown },
  max = 120,
): Pick<RunActivityRow, "promptSnippet" | "agentMessage"> {
  if (input.trigger !== "bot_message")
    return { promptSnippet: promptSnippet(input.prompt, max), agentMessage: null };
  const parsed = MessageBlock.array().safeParse(input.sourceBlocks);
  const message = parsed.success ? botMessageContext(parsed.data) : undefined;
  if (!message) {
    return {
      promptSnippet: "Message from another agent",
      agentMessage: { kind: "unknown" },
    };
  }
  const name = displayName(message.fromBotName, "Another agent");
  const kind =
    message.intent === "result" || message.intent === "status" || message.intent === "fyi"
      ? "update"
      : "request";
  const label = kind === "update" ? `Update from ${name}` : `${name} asked`;
  return {
    promptSnippet: promptSnippet(message.text.trim() ? `${label}: ${message.text}` : label, max),
    agentMessage: {
      fromBotName: displayName(message.fromBotName, ""),
      kind,
      text: promptSnippet(message.text, max),
    },
  };
}

export function activityNotificationsEnabled(
  groupId: string | null,
  notifyOnFinish: boolean,
): boolean {
  return groupId !== null || notifyOnFinish;
}

export async function listSpaceRuns(
  prisma: PrismaClient,
  actor: Actor,
  filter: "active" | "recent",
): Promise<RunActivityRow[]> {
  const rows = await prisma.run.findMany({
    where: {
      spaceId: actor.spaceId,
      userId: actor.userId,
      bot: { archivedAt: null },
      // Background ticket work belongs on the board, not in the activity list.
      trigger: { notIn: [...BACKGROUND_RUN_TRIGGERS] },
      ...(filter === "active"
        ? { status: { in: [...ACTIVE_RUN_STATUSES] } }
        : { status: { in: [...TERMINAL_STATUSES] } }),
    },
    include: {
      bot: { select: { name: true, archivedAt: true, notifyOnFinish: true } },
      task: { select: { prompt: true } },
      sourceMessage: { select: { blocks: true } },
      thread: {
        select: {
          groupId: true,
          group: { select: { name: true } },
        },
      },
    },
    orderBy:
      filter === "active"
        ? [{ updatedAt: "desc" }, { id: "desc" }]
        : [{ completedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    take: filter === "recent" ? RECENT_LIMIT : undefined,
  });

  return rows.map((row) => ({
    runId: row.id,
    botId: row.botId,
    botName: row.bot.name,
    groupId: row.thread.groupId,
    groupName: row.thread.group ? row.thread.group.name : null,
    threadId: row.threadId,
    status: row.status as RunActivityRow["status"],
    trigger: row.trigger as RunActivityRow["trigger"],
    notificationsEnabled: activityNotificationsEnabled(row.thread.groupId, row.bot.notifyOnFinish),
    ...activityPreview({
      trigger: row.trigger,
      prompt: row.task.prompt,
      sourceBlocks: row.sourceMessage?.blocks,
    }),
    updatedAt: (filter === "recent" && row.completedAt
      ? row.completedAt
      : row.updatedAt
    ).toISOString(),
  }));
}

const RUN_ACTIONS_LIMIT = 200;

/**
 * What the bot did during one of the caller's own runs, read from the audit log the tool gate
 * writes. Labels are the humanized tool names recorded there; no arguments or content.
 */
export async function listRunActions(
  prisma: PrismaClient,
  actor: Actor,
  runId: string,
): Promise<RunAction[]> {
  const run = await prisma.run.findFirst({
    where: { id: runId, spaceId: actor.spaceId, userId: actor.userId },
    select: { id: true },
  });
  if (!run) throw new IsolationError();
  const rows = await runAsSystem("read a run's own action receipts", () =>
    prisma.auditEvent.findMany({
      where: { runId: run.id, spaceId: actor.spaceId, action: "tool.call" },
      select: { createdAt: true, targetLabel: true, targetId: true, outcome: true },
      orderBy: { createdAt: "asc" },
      take: RUN_ACTIONS_LIMIT,
    }),
  );
  return rows.map((row) => ({
    at: row.createdAt.toISOString(),
    label: row.targetLabel || row.targetId || "Action",
    outcome: row.outcome === "denied" || row.outcome === "failure" ? row.outcome : "success",
  }));
}
