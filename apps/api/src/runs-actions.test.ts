import { IsolationError } from "@argo/db";
import { describe, expect, it, vi } from "vitest";
import { listRunActions } from "./runs.js";

const actor = { userId: "u", spaceId: "s", email: "u@argo.test", isDeploymentOwner: false };

function prisma(run: unknown, rows: unknown[]) {
  return {
    run: { findFirst: vi.fn(async () => run) },
    auditEvent: { findMany: vi.fn(async () => rows) },
  } as never;
}

describe("listRunActions", () => {
  it("lists a run's recorded tool calls with readable labels", async () => {
    const at = new Date("2026-11-13T07:00:00Z");
    const actions = await listRunActions(
      prisma({ id: "r" }, [
        {
          createdAt: at,
          targetLabel: "Gmail create draft",
          targetId: "GMAIL_CREATE_DRAFT",
          outcome: "success",
        },
        { createdAt: at, targetLabel: null, targetId: "send_email", outcome: "denied" },
      ]),
      actor,
      "r",
    );
    expect(actions).toEqual([
      { at: at.toISOString(), label: "Gmail create draft", outcome: "success" },
      { at: at.toISOString(), label: "send_email", outcome: "denied" },
    ]);
  });

  it("refuses runs that are not the caller's", async () => {
    await expect(listRunActions(prisma(null, []), actor, "r")).rejects.toBeInstanceOf(
      IsolationError,
    );
  });
});
