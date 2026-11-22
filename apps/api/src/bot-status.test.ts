import { IsolationError } from "@argo/db";
import { describe, expect, it, vi } from "vitest";
import {
  publishBotStatus,
  readPublicBotStatus,
  statusUrl,
  taskTitle,
  unpublishBotStatus,
} from "./bot-status.js";

const actor = { userId: "u", spaceId: "s", email: "u@argo.test", isDeploymentOwner: false };

function fake(bot: unknown, page: unknown = null, runs: unknown[] = [], shares: unknown[] = []) {
  return {
    bot: { findFirst: vi.fn(async () => bot) },
    botStatusPage: {
      create: vi.fn(async ({ data }: { data: { id: string } }) => ({ id: data.id })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => page),
    },
    run: { findMany: vi.fn(async () => runs), count: vi.fn(async () => runs.length) },
    runShare: { findMany: vi.fn(async () => shares) },
  };
}

describe("bot status page", () => {
  it("titles a task by the first line of its prompt, redacted and short", () => {
    expect(taskTitle("\nEmail ada@example.com the report\nsecret details")).toBe(
      "Email [email] the report",
    );
    expect(taskTitle("x".repeat(200)).length).toBe(80);
  });

  it("publishes only the caller's own bot, once", async () => {
    const none = fake(null);
    await expect(publishBotStatus(none as never, actor, "b")).rejects.toBeInstanceOf(
      IsolationError,
    );
    const existing = fake({ id: "b", statusPage: { id: "abcdef1234" } });
    expect(await publishBotStatus(existing as never, actor, "b")).toBe("abcdef1234");
    expect(existing.botStatusPage.create).not.toHaveBeenCalled();
    const fresh = fake({ id: "b", statusPage: null });
    expect(await publishBotStatus(fresh as never, actor, "b")).toMatch(/^[A-Za-z0-9]{12}$/);
  });

  it("revokes by the owner's scope", async () => {
    const client = fake(null);
    await unpublishBotStatus(client as never, actor, "b");
    expect(client.botStatusPage.deleteMany).toHaveBeenCalledWith({
      where: { botId: "b", spaceId: "s", userId: "u" },
    });
  });

  it("shows the bot name and finished task titles, never results", async () => {
    const at = new Date("2026-11-16T10:00:00Z");
    const client = fake(
      null,
      {
        bot: {
          id: "b",
          name: "Chief",
          description: " Researches ada@example.com leads ",
          archivedAt: null,
        },
      },
      [
        { completedAt: at, task: { prompt: "Find flights\nmy card is 4111 1111 1111 1111" } },
        { completedAt: at, task: null },
      ],
      [{ id: "share1", prompt: "Compare laptops\nbudget details", createdAt: at }],
    );
    expect(await readPublicBotStatus(client as never, "abcdef1234")).toEqual({
      botName: "Chief",
      description: "Researches [email] leads",
      completed: 2,
      shared: [{ id: "share1", title: "Compare laptops", at: at.toISOString() }],
      tasks: [{ title: "Find flights", at: at.toISOString() }],
    });
    expect(client.runShare.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { run: { botId: "b" } } }),
    );
  });

  it("hides revoked, archived and malformed links", async () => {
    expect(await readPublicBotStatus(fake(null) as never, "abcdef1234")).toBeNull();
    const archived = fake(null, { bot: { id: "b", name: "x", archivedAt: new Date() } });
    expect(await readPublicBotStatus(archived as never, "abcdef1234")).toBeNull();
    expect(await readPublicBotStatus(fake(null) as never, "../x")).toBeNull();
    expect(statusUrl("https://argo.test/", "abc")).toBe("https://argo.test/s/abc");
  });
});
