import { describe, expect, it } from "vitest";
import type { ToolCallBudget } from "./pi-runtime-tools.js";
import { toolCallBudgetExceededMessage } from "./pi-runtime-tools.js";
import {
  CHECK_IN_GRACE_CALLS,
  CHECK_IN_MS,
  CHECK_IN_STEPS,
  dueForCheckIn,
  newCheckIn,
  requestCheckIn,
  resetCheckIn,
} from "./run-check-in.js";

const host = (limit = 0) => ({
  toolCallBudget: { count: 0, exceeded: false, limit, inFlight: 0 } as ToolCallBudget,
});

describe("run check-in", () => {
  it("is due after enough steps or enough time, only with a person in the chat", () => {
    const h = host();
    const checkIn = newCheckIn(h, 0);
    expect(dueForCheckIn(checkIn, true, 1_000)).toBe(false);
    checkIn.steps = CHECK_IN_STEPS;
    expect(dueForCheckIn(checkIn, true, 1_000)).toBe(true);
    expect(dueForCheckIn(checkIn, false, 1_000)).toBe(false);
    checkIn.steps = 0;
    expect(dueForCheckIn(checkIn, true, CHECK_IN_MS)).toBe(true);
  });

  it("asks once, then stops a bot that keeps going a few calls later", () => {
    const h = host();
    h.toolCallBudget.count = 50;
    const checkIn = newCheckIn(h, 0);
    checkIn.steps = CHECK_IN_STEPS;
    requestCheckIn(checkIn, h);
    expect(h.toolCallBudget.limit).toBe(50 + CHECK_IN_GRACE_CALLS);
    expect(h.toolCallBudget.checkIn).toBe(true);
    expect(dueForCheckIn(checkIn, true, 0)).toBe(false);
  });

  it("keeps a tighter self-host fuse", () => {
    const h = host(20);
    h.toolCallBudget.count = 18;
    const checkIn = newCheckIn(h, 0);
    requestCheckIn(checkIn, h);
    expect(h.toolCallBudget.limit).toBe(20);
  });

  it("starts a fresh allowance when the person writes", () => {
    const h = host();
    h.toolCallBudget.count = 40;
    const checkIn = newCheckIn(h, 0);
    checkIn.steps = CHECK_IN_STEPS;
    requestCheckIn(checkIn, h);
    resetCheckIn(checkIn, h, 5_000);
    expect(h.toolCallBudget.limit).toBe(0);
    expect(h.toolCallBudget.checkIn).toBe(false);
    expect(checkIn).toMatchObject({ steps: 0, since: 5_000, sent: false });
  });

  it("says it paused, not that it hit a number", () => {
    expect(toolCallBudgetExceededMessage(45, true)).not.toMatch(/\d/);
    expect(toolCallBudgetExceededMessage(45)).toContain("45");
  });
});
