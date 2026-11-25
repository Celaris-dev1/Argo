import { describe, expect, it } from "vitest";
import { requestedResearchArgs } from "./run-tools-research.js";

describe("requestedResearchArgs", () => {
  it("drops a deeper level the request did not ask for", () => {
    expect(
      requestedResearchArgs({ question: "cheapest way to send money", depth: "high" }),
    ).toEqual({
      question: "cheapest way to send money",
    });
  });

  it("keeps a level or number the request names", () => {
    const args = {
      question: "ultra research on EV batteries, 80 sources",
      depth: "ultra",
      sources: 80,
    };
    expect(requestedResearchArgs(args)).toEqual(args);
  });

  it("drops numeric overrides the request never mentioned", () => {
    expect(requestedResearchArgs({ question: "solar prices", questions: 24, rounds: 2 })).toEqual({
      question: "solar prices",
    });
  });
});
