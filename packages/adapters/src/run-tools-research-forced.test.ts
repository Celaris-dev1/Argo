import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunContext } from "./run-context.js";

const runResearch = vi.fn();
vi.mock("./research-engine.js", () => ({
  runResearch: (...args: unknown[]) => runResearch(...args),
}));
vi.mock("./work-status.js", () => ({ postWorkStatus: vi.fn() }));

const { forcedResearchRequest, runForcedResearch } = await import("./run-tools-research.js");

const ctx = {
  runId: "run_1",
  run: { userId: "u", spaceId: "s", botId: "b", threadId: "t" },
  context: { signal: new AbortController().signal },
  deps: {},
  providers: { web: {} },
} as unknown as RunContext;

describe("forced /Research", () => {
  beforeEach(() => runResearch.mockReset());

  it("detects a composer-forced Research turn and keeps the request", () => {
    expect(forcedResearchRequest("/Research cheapest flights to Lagos")).toBe(
      "cheapest flights to Lagos",
    );
    expect(forcedResearchRequest("Use skill: Research\nhigh: solar prices")).toBe(
      "high: solar prices",
    );
    expect(forcedResearchRequest("/Research")).toBeNull();
    expect(forcedResearchRequest("research cheapest flights")).toBeNull();
    expect(forcedResearchRequest("/Researcher notes")).toBeNull();
  });

  it("runs research itself so the model only presents the report", async () => {
    runResearch.mockResolvedValue({
      report: "Report body [1]",
      stats: { depth: "low", read: 12, searches: 8, elapsedMs: 1000, stoppedEarly: false },
    });
    const prompt = await runForcedResearch(ctx, "cheapest flights to Lagos");
    expect(runResearch).toHaveBeenCalledTimes(1);
    expect(runResearch.mock.calls[0]?.[0]).toBe("cheapest flights to Lagos");
    expect(runResearch.mock.calls[0]?.[1]).toMatchObject({ depth: "low" });
    expect(prompt).toContain("Report body [1]");
    expect(prompt).toContain("Do not call deep_research again");
  });

  it("honours a depth named in the request", async () => {
    runResearch.mockResolvedValue({
      report: "r",
      stats: { depth: "high", read: 1, searches: 1, elapsedMs: 1, stoppedEarly: false },
    });
    await runForcedResearch(ctx, "high: EV battery makers");
    expect(runResearch.mock.calls[0]?.[1]).toMatchObject({ depth: "high" });
  });
});
