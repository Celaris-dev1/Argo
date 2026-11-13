import type * as db from "@argo/db";
import { appendEventInTransaction } from "@argo/db";
import { describe, expect, it, vi } from "vitest";
import {
  answerMorningBrief,
  appConnectedTask,
  chooseFocus,
  firstBotApps,
  markAppConnected,
  offerFirstApps,
  offerMorningBrief,
  onlyFirstTaskRunning,
  promptFocus,
} from "./onboarding.js";

const posted = vi.hoisted(() => [] as Array<{ blocks: unknown[]; markUnread?: boolean }>);
vi.mock("@argo/db", async (original) => ({
  ...(await original<typeof db>()),
  createThreadMessageInTransaction: vi.fn(async (_tx, input) => {
    posted.push(input);
    return { id: "posted" };
  }),
  appendEventInTransaction: vi.fn(async () => ({ seq: 1 })),
}));
function fixture(catalog: unknown[]) {
  posted.length = 0;
  const tx = {
    $executeRaw: vi.fn(),
    message: {
      findMany: vi.fn(async () => [{ id: "choice", blocks: [{ kind: "choice", answerId: null }] }]),
      update: vi.fn(),
    },
  };
  const deps = {
    prisma: {
      bot: { findFirst: vi.fn(async () => ({ id: "bot", thread: { id: "thread" } })) },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    },
    events: { notify: vi.fn() },
    connectors: {
      managedProviders: () => [{ catalog: async () => catalog }],
      managed: () => ({ catalog: async () => catalog }),
    },
  } as unknown as Parameters<typeof chooseFocus>[0];
  const actor = {
    userId: "user",
    spaceId: "space",
    email: "user@argo.test",
    isDeploymentOwner: true,
  };
  return { deps, actor, tx };
}
describe("onboarding connection suggestions", () => {
  it("does not invent authorization cards when no connector has an app catalog", async () => {
    const { deps, actor } = fixture([]);
    await chooseFocus(deps, actor, "bot", "day");
    expect(posted.flatMap((message) => message.blocks)).not.toContainEqual(
      expect.objectContaining({ kind: "app_connect" }),
    );
    expect(posted.length).toBeGreaterThan(0);
    // The reply to the user's pick is read; suggestions after the catalog wait stay unread.
    expect(posted[0]?.markUnread).toBe(false);
    expect(posted.slice(1).every((message) => message.markUnread === true)).toBe(true);
  });
  it("uses the available connector and omits unavailable apps", async () => {
    const { deps, actor } = fixture([
      { connectorId: "pipedream", slug: "slack", name: "Slack", connected: false, logo: null },
    ]);
    await chooseFocus(deps, actor, "bot", "day");
    expect(
      posted
        .flatMap((message) => message.blocks)
        .filter((block) => (block as { kind: string }).kind === "app_connect"),
    ).toEqual([
      expect.objectContaining({ connectorId: "pipedream", provider: "slack", name: "Slack" }),
    ]);
  });
});

describe("promptFocus", () => {
  function focusFixture(options: { introRun?: boolean; blocks?: unknown[] } = {}) {
    const { deps, actor, tx } = fixture([]);
    tx.message.findMany = vi.fn(async () =>
      options.blocks ? [{ role: "bot", blocks: options.blocks }] : [],
    ) as never;
    const run = {
      findFirst: vi.fn(async () => (options.introRun ? { id: "intro" } : null)),
    };
    Object.assign(tx, { run });
    return { deps, actor, run };
  }

  it("posts the fixed focus card when the bot has no creation intro", async () => {
    const { deps, actor } = focusFixture();
    await promptFocus(deps, actor, "bot");
    expect(posted.flatMap((message) => message.blocks)).toContainEqual(
      expect.objectContaining({ kind: "choice" }),
    );
  });

  it("leaves the question to a bot whose creation intro is queued or running", async () => {
    const { deps, actor, run } = focusFixture({ introRun: true });
    await promptFocus(deps, actor, "bot");
    expect(posted).toEqual([]);
    expect(run.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ threadId: "thread", trigger: "created" }),
      }),
    );
  });

  it("does not post over a question the bot already asked", async () => {
    const { deps, actor } = focusFixture({
      blocks: [{ kind: "ask", text: "What do you want me for?", status: "answered" }],
    });
    await promptFocus(deps, actor, "bot");
    expect(posted).toEqual([]);
  });
});

it("marks only the authorized connector when provider slugs collide", async () => {
  const { deps, actor, tx } = fixture([
    { connectorId: "pipedream", slug: "slack", name: "Slack", connected: true },
  ]);
  const blocks = ["composio", "pipedream"].map((connectorId) => ({
    kind: "app_connect",
    connectorId,
    provider: "slack",
    name: "Slack",
    status: "pending",
  }));
  tx.message.findMany = vi.fn(async () => [{ id: "cards", blocks }]) as never;
  await markAppConnected(deps, actor, "bot", "slack", "pipedream");
  expect(tx.message.update).toHaveBeenCalledWith({
    where: { id: "cards" },
    data: { blocks: [blocks[0], { ...blocks[1], status: "connected" }] },
  });
});

it("does not trust a client's connected claim", async () => {
  const { deps, actor, tx } = fixture([
    { connectorId: "pipedream", slug: "slack", connected: false },
  ]);
  Object.assign(deps.prisma, { message: { findMany: vi.fn() } });
  await markAppConnected(deps, actor, "bot", "slack", "pipedream", "thread");
  expect(deps.prisma.message.findMany).not.toHaveBeenCalled();
  expect(tx.message.update).not.toHaveBeenCalled();
});

it("rejects a thread from another user or space before reading its messages", async () => {
  const { deps, actor, tx } = fixture([
    { connectorId: "pipedream", slug: "slack", connected: true },
  ]);
  Object.assign(deps.prisma, { thread: { findFirst: vi.fn(async () => null) } });
  await expect(
    markAppConnected(deps, actor, "bot", "slack", "pipedream", "other-thread"),
  ).rejects.toThrow();
  expect(deps.prisma.thread.findFirst).toHaveBeenCalledWith({
    where: { id: "other-thread", spaceId: actor.spaceId },
  });
  expect(tx.message.update).not.toHaveBeenCalled();
});

it("updates an accessible group thread and emits its normal update event", async () => {
  const { deps, actor, tx } = fixture([
    { connectorId: "pipedream", slug: "slack", connected: true },
  ]);
  Object.assign(deps.prisma, {
    thread: {
      findFirst: vi.fn(async () => ({ id: "group-thread", groupId: "group" })),
    },
  });
  Object.assign(deps.prisma, {
    chatGroup: {
      findFirst: vi.fn(async () => ({
        id: "group",
        name: "Team",
        thread: { id: "group-thread" },
        members: ["bot", "peer"].map((id) => ({ bot: { id, name: id, runs: [] } })),
      })),
    },
  });
  tx.message.findMany = vi.fn(async () => [
    {
      id: "card",
      blocks: [
        { kind: "app_connect", connectorId: "pipedream", provider: "slack", status: "pending" },
      ],
    },
  ]) as never;
  await markAppConnected(deps, actor, "bot", "slack", "pipedream", "group-thread");
  expect(deps.prisma.chatGroup.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: "group", spaceId: actor.spaceId, userId: actor.userId, archivedAt: null },
    }),
  );
  expect(tx.message.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { threadId: "group-thread" } }),
  );
  expect(tx.message.update).toHaveBeenCalledWith({
    where: { id: "card" },
    data: { blocks: [expect.objectContaining({ status: "connected" })] },
  });
  expect(appendEventInTransaction).toHaveBeenCalledWith(
    tx,
    expect.objectContaining({
      threadId: "group-thread",
      spaceId: actor.spaceId,
      type: "thread.message.updated",
    }),
  );
  expect(deps.events.notify).toHaveBeenCalledWith("group-thread", 1);
});

it("rejects another user's group even in the same space", async () => {
  const { deps, actor, tx } = fixture([
    { connectorId: "pipedream", slug: "slack", connected: true },
  ]);
  Object.assign(deps.prisma, {
    thread: {
      findFirst: vi.fn(async () => ({ id: "other-thread", groupId: "other-group" })),
    },
  });
  Object.assign(deps.prisma, { chatGroup: { findFirst: vi.fn(async () => null) } });
  await expect(
    markAppConnected(deps, actor, "bot", "slack", "pipedream", "other-thread"),
  ).rejects.toThrow();
  expect(tx.message.update).not.toHaveBeenCalled();
  expect(deps.prisma.bot.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "bot", spaceId: actor.spaceId, userId: actor.userId } }),
  );
});

it("updates the authorized card's own message even outside the bounded scan", async () => {
  const { deps, actor, tx } = fixture([
    { connectorId: "pipedream", slug: "slack", name: "Slack", connected: true },
  ]);
  const card = {
    kind: "app_connect",
    connectorId: "pipedream",
    provider: "slack",
    name: "Slack",
    status: "pending",
  };
  tx.message.findMany = vi.fn(async ({ where }: { where: { id?: string; threadId: string } }) =>
    where.id === "middle" && where.threadId === "thread" ? [{ id: "middle", blocks: [card] }] : [],
  ) as never;
  await markAppConnected(deps, actor, "bot", "slack", "pipedream", "thread", "middle");
  expect(tx.message.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "middle", threadId: "thread" } }),
  );
  expect(tx.message.update).toHaveBeenCalledWith({
    where: { id: "middle" },
    data: { blocks: [{ ...card, status: "connected" }] },
  });
});

describe("first apps", () => {
  it("reads the deployment's app list", () => {
    expect(firstBotApps(" gmail, googlecalendar ,,twitter ")).toEqual([
      "gmail",
      "googlecalendar",
      "twitter",
    ]);
    expect(firstBotApps(undefined)).toEqual([]);
  });

  it("offers the listed apps the person has not connected, under one line", async () => {
    const { deps, actor } = fixture([
      { connectorId: "composio", slug: "gmail", name: "Gmail", connected: false, logo: null },
      { connectorId: "composio", slug: "slack", name: "Slack", connected: true, logo: null },
    ]);
    await offerFirstApps(deps, actor, "bot", ["gmail", "slack", "notion"]);
    expect(posted).toHaveLength(1);
    const blocks = posted[0]?.blocks as Array<{ kind: string; provider?: string }>;
    expect(blocks[0]?.kind).toBe("text");
    expect(blocks.filter((block) => block.kind === "app_connect")).toEqual([
      expect.objectContaining({ provider: "gmail", status: "pending" }),
    ]);
  });

  it("posts nothing when no listed app is available", async () => {
    const { deps, actor } = fixture([]);
    await offerFirstApps(deps, actor, "bot", ["gmail"]);
    await offerFirstApps(deps, actor, "bot", []);
    expect(posted).toEqual([]);
  });
});

describe("app connected task", () => {
  it("names the app in the deployment's task and stays off when unset", () => {
    expect(appConnectedTask("Gmail", "I just connected {app}. Go through it.")).toBe(
      "I just connected Gmail. Go through it.",
    );
    expect(appConnectedTask("Gmail", "  ")).toBeUndefined();
    expect(appConnectedTask("Gmail", undefined)).toBeUndefined();
  });

  it("reports a newly connected card once, so a repeat never starts a second job", async () => {
    const { deps, actor, tx } = fixture([
      { connectorId: "composio", slug: "gmail", name: "Gmail", connected: true },
    ]);
    const card = {
      kind: "app_connect",
      connectorId: "composio",
      provider: "gmail",
      status: "pending",
    };
    tx.message.findMany = vi.fn(async () => [{ id: "card", blocks: [card] }]) as never;
    expect(await markAppConnected(deps, actor, "bot", "gmail", "composio")).toEqual({
      name: "Gmail",
      threadId: "thread",
    });
    tx.message.findMany = vi.fn(async () => [
      { id: "card", blocks: [{ ...card, status: "connected" }] },
    ]) as never;
    expect(await markAppConnected(deps, actor, "bot", "gmail", "composio")).toBeUndefined();
  });
});

describe("onlyFirstTaskRunning", () => {
  const prisma = (runId: string | null, active: string[]) =>
    ({
      message: { findUnique: vi.fn(async () => (runId === null ? null : { runId })) },
      run: { findMany: vi.fn(async () => active.map((id) => ({ id }))) },
    }) as never;

  it("is true only while the opening demo is the sole active run", async () => {
    expect(await onlyFirstTaskRunning(prisma("demo", ["demo"]), "bot", "thread")).toBe(true);
    expect(await onlyFirstTaskRunning(prisma("demo", []), "bot", "thread")).toBe(false);
    expect(await onlyFirstTaskRunning(prisma("demo", ["demo", "mine"]), "bot", "thread")).toBe(
      false,
    );
    expect(await onlyFirstTaskRunning(prisma("demo", ["mine"]), "bot", "thread")).toBe(false);
    expect(await onlyFirstTaskRunning(prisma(null, ["mine"]), "bot", "thread")).toBe(false);
  });
});

describe("morning brief", () => {
  const card = {
    kind: "choice",
    question: "q",
    options: [
      { id: "morning-brief", letter: "A", label: "Every morning" },
      { id: "morning-brief-skip", letter: "B", label: "Not now" },
    ],
  };
  function setup(opts: { offered?: boolean; routines?: number; timezone?: string | null }) {
    const { deps, actor, tx } = fixture([]);
    const prisma = deps.prisma as unknown as Record<string, unknown>;
    const created: unknown[] = [];
    prisma.message = {
      findMany: vi.fn(async () => (opts.offered ? [{ blocks: [card] }] : [])),
    };
    prisma.routine = { count: vi.fn(async () => opts.routines ?? 0) };
    Object.assign(tx, {
      user: { findUnique: vi.fn(async () => ({ timezone: opts.timezone ?? null })) },
      routine: {
        create: vi.fn(async ({ data }: { data: unknown }) => {
          created.push(data);
          return { id: "routine", ...(data as object) };
        }),
      },
    });
    tx.message.findMany = vi.fn(async () => [{ id: "card", blocks: [card] }]) as never;
    return { deps, actor, tx, created };
  }

  it("offers once, and not when the bot already has one", async () => {
    let s = setup({});
    await offerMorningBrief(s.deps, s.actor, "bot");
    expect(posted.flatMap((m) => m.blocks)).toContainEqual(
      expect.objectContaining({ kind: "choice" }),
    );
    s = setup({ offered: true });
    await offerMorningBrief(s.deps, s.actor, "bot");
    expect(posted).toHaveLength(0);
    s = setup({ routines: 1 });
    await offerMorningBrief(s.deps, s.actor, "bot");
    expect(posted).toHaveLength(0);
  });

  it("schedules 7:00 in the person's timezone on yes, nothing on not now", async () => {
    let s = setup({ timezone: "Africa/Lagos" });
    const made = await answerMorningBrief(s.deps, s.actor, "bot", "morning-brief");
    expect(s.created).toEqual([
      expect.objectContaining({
        crons: ["0 7 * * *"],
        timezone: "Africa/Lagos",
        active: true,
        botId: "bot",
      }),
    ]);
    expect(made?.routine.id).toBe("routine");
    expect(s.tx.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { blocks: [expect.objectContaining({ answerId: "morning-brief" })] },
      }),
    );
    s = setup({});
    expect(await answerMorningBrief(s.deps, s.actor, "bot", "morning-brief-skip")).toBeUndefined();
    expect(s.created).toHaveLength(0);
  });

  it("keeps the focus flow from claiming the morning card", async () => {
    const s = setup({});
    await chooseFocus(s.deps, s.actor, "bot", "day");
    expect(s.tx.message.update).not.toHaveBeenCalled();
  });
});
