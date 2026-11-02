import { describe, expect, it } from "vitest";
import { codingStallMinutes, parseCodingVerdict } from "./coding-mode.js";

describe("coding verdict", () => {
  it("reads READY with evidence", () => {
    const summary =
      "Fixed the login bug.\nREADY: login works with SSO\nEVIDENCE: pnpm test (42 passed)\n- commit a1b2c3d";
    expect(parseCodingVerdict(summary)).toEqual({
      kind: "ready",
      result: "login works with SSO",
      evidence: ["pnpm test (42 passed)", "commit a1b2c3d"],
    });
  });

  it("treats READY without evidence as unproven", () => {
    expect(parseCodingVerdict("READY: done")).toEqual({ kind: "unproven" });
    expect(parseCodingVerdict("All done!")).toEqual({ kind: "unproven" });
  });

  it("reads BLOCKED, and a later BLOCKED wins over an earlier READY", () => {
    expect(parseCodingVerdict("BLOCKED: need the Stripe test key")).toEqual({
      kind: "blocked",
      reason: "need the Stripe test key",
    });
    expect(
      parseCodingVerdict("READY: x\nEVIDENCE: y\nthen tests broke\nBLOCKED: need DB access"),
    ).toEqual({ kind: "blocked", reason: "need DB access" });
  });

  it("reads bold markers", () => {
    expect(parseCodingVerdict("**READY**: built\n**EVIDENCE**: pnpm build ok").kind).toBe("ready");
  });

  it("parses stall thresholds", () => {
    expect(codingStallMinutes(undefined)).toEqual([10, 20, 40]);
    expect(codingStallMinutes("30, 5")).toEqual([5, 30]);
    expect(codingStallMinutes("junk")).toEqual([10, 20, 40]);
  });
});
