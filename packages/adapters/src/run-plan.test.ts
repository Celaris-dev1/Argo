import { describe, expect, it } from "vitest";
import { newRunPlan, PLAN_DRIFT_STEPS, planDriftPrompt, updateRunPlan } from "./run-plan.js";

describe("run plan", () => {
  it("renders the plan and rejects an empty one", () => {
    const plan = newRunPlan();
    expect(updateRunPlan(plan, { items: [] })).toMatch(/at least one/);
    const text = updateRunPlan(plan, {
      items: [
        { id: "1", title: "Find flights", status: "done" },
        { id: "2", title: "Book hotel", status: "doing" },
      ],
    });
    expect(text).toContain("Plan: 1 of 2 done.");
    expect(text).toContain("[~] 2. Book hotel");
  });

  it("pulls the bot back once after drifting, and resets on progress", () => {
    const plan = newRunPlan();
    updateRunPlan(plan, {
      items: [
        { id: "1", title: "A" },
        { id: "2", title: "B" },
      ],
    });
    plan.stepsSinceProgress = PLAN_DRIFT_STEPS - 1;
    expect(planDriftPrompt(plan)).toBeUndefined();
    plan.stepsSinceProgress = PLAN_DRIFT_STEPS;
    expect(planDriftPrompt(plan)).toContain("1. A");
    expect(planDriftPrompt(plan)).toBeUndefined();
    updateRunPlan(plan, {
      items: [
        { id: "1", title: "A", status: "done" },
        { id: "2", title: "B" },
      ],
    });
    expect(plan.stepsSinceProgress).toBe(0);
    expect(plan.nudged).toBe(false);
  });
});
