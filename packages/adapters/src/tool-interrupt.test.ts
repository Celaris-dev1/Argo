import type { AgentRunRequest } from "@argo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { untilInterrupted } from "./pi-runtime-tools.js";

const host = (signal: AbortSignal, steeringWaiting?: () => Promise<boolean>, depth = 0) => ({
  signal,
  depth,
  request: { steeringWaiting } as unknown as AgentRunRequest,
});

describe("untilInterrupted", () => {
  it("returns the call's own result when nothing interrupts it", async () => {
    const result = await untilInterrupted(
      host(new AbortController().signal),
      Promise.resolve(7),
      5,
    );
    expect(result).toBe(7);
  });

  it("stops waiting as soon as the run is stopped", async () => {
    const controller = new AbortController();
    const pending = untilInterrupted(host(controller.signal), new Promise(() => undefined), 5);
    controller.abort();
    expect(typeof (await pending)).toBe("symbol");
    expect(String(await pending)).toContain("stopped");
  });

  it("stops waiting when the run's person writes", async () => {
    let calls = 0;
    const waiting = vi.fn(async () => ++calls >= 2);
    const result = await untilInterrupted(
      host(new AbortController().signal, waiting),
      new Promise(() => undefined),
      5,
    );
    expect(String(result)).toContain("steered");
    expect(waiting).toHaveBeenCalledTimes(2);
  });

  it("leaves helper agents to their parent", async () => {
    const waiting = vi.fn(async () => true);
    const result = await untilInterrupted(
      host(new AbortController().signal, waiting, 1),
      new Promise((resolve) => setTimeout(() => resolve("done"), 30)),
      5,
    );
    expect(result).toBe("done");
    expect(waiting).not.toHaveBeenCalled();
  });

  it("does not let a call left running in the background fail the run", async () => {
    const controller = new AbortController();
    let reject: (error: Error) => void = () => undefined;
    const work = new Promise((_, fail) => {
      reject = fail;
    });
    const pending = untilInterrupted(host(controller.signal), work, 5);
    controller.abort();
    await pending;
    reject(new Error("late failure"));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
