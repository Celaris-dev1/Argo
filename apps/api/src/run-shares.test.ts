import { IsolationError } from "@argo/db";
import { describe, expect, it, vi } from "vitest";
import { readPublicShare, redactForSharing, shareRun, shareUrl } from "./run-shares.js";

const actor = { userId: "u", spaceId: "s", email: "u@argo.test", isDeploymentOwner: false };

function prisma(
  run: unknown,
  reply: unknown = { blocks: [{ kind: "text", text: "Done: booked." }] },
) {
  const created: unknown[] = [];
  return {
    created,
    client: {
      run: { findFirst: vi.fn(async () => run) },
      message: { findFirst: vi.fn(async () => reply) },
      auditEvent: {
        findMany: vi.fn(async () => [
          {
            createdAt: new Date(),
            targetLabel: "Browser navigate",
            targetId: "x",
            outcome: "success",
          },
        ]),
      },
      runShare: {
        create: vi.fn(async ({ data }: { data: { id: string } }) => {
          created.push(data);
          return { id: data.id };
        }),
        findUnique: vi.fn(async () => null),
      },
    } as never,
  };
}

const run = {
  id: "r",
  threadId: "t",
  bot: { name: "Scout" },
  task: null,
  sourceMessage: {
    blocks: [{ kind: "text", text: "Email ada@example.org about +234 803 123 4567" }],
  },
  share: null,
};

describe("run shares", () => {
  it("redacts emails, phone numbers and keys", () => {
    expect(
      redactForSharing("mail bob@x.io or call +1 (415) 555-0100, key sk-abcdefghijklmnop"),
    ).toBe("mail [email] or call [number], key [key]");
  });

  it("snapshots a finished run with redacted text and step labels only", async () => {
    const db = prisma(run);
    const { id } = await shareRun(db.client, actor, "r");
    expect(id).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(db.created).toEqual([
      expect.objectContaining({
        runId: "r",
        botName: "Scout",
        prompt: "Email [email] about [number]",
        result: "Done: booked.",
        steps: [{ label: "Browser navigate", outcome: "success" }],
      }),
    ]);
    expect(shareUrl("https://argo.test/", id)).toBe(`https://argo.test/r/${id}`);
  });

  it("returns the existing link instead of making a second one", async () => {
    const db = prisma({ ...run, share: { id: "existing123" } });
    expect(await shareRun(db.client, actor, "r")).toEqual({ id: "existing123" });
    expect(db.created).toHaveLength(0);
  });

  it("refuses runs that are not the caller's finished runs, or have no result", async () => {
    await expect(shareRun(prisma(null).client, actor, "r")).rejects.toBeInstanceOf(IsolationError);
    await expect(shareRun(prisma(run, null).client, actor, "r")).rejects.toBeInstanceOf(
      IsolationError,
    );
  });

  it("ignores malformed public ids without touching the database", async () => {
    const db = prisma(run);
    expect(await readPublicShare(db.client, "../etc")).toBeNull();
  });
});
