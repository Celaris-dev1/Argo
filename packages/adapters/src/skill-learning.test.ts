import { describe, expect, it } from "vitest";
import { isLearnedSkill, learningSettings, parseLearningReply } from "./skill-learning.js";

describe("skill learning", () => {
  it("is on by default and can be turned off", () => {
    expect(learningSettings({})).toEqual({ enabled: true, minTools: 3 });
    expect(learningSettings({ ARGO_SKILL_LEARNING: "off" }).enabled).toBe(false);
    expect(learningSettings({ ARGO_SKILL_LEARNING_MIN_TOOLS: "5" }).minTools).toBe(5);
  });

  it("parses operations and caps them at two", () => {
    const reply = `Sure:\n${JSON.stringify({
      operations: [
        {
          op: "create",
          name: "upload-to-drive",
          description: "Use when uploading",
          body: "1. Open",
        },
        { op: "update", name: "login-flow", body: "Use the SSO button" },
        { op: "delete", name: "old-skill" },
      ],
    })}`;
    expect(parseLearningReply(reply)).toEqual([
      { op: "create", name: "upload-to-drive", description: "Use when uploading", body: "1. Open" },
      { op: "update", name: "login-flow", body: "Use the SSO button" },
    ]);
  });

  it("drops malformed, badly named and secret-bearing operations", () => {
    expect(parseLearningReply("no json here")).toEqual([]);
    expect(parseLearningReply('{"operations": "nope"}')).toEqual([]);
    const reply = JSON.stringify({
      operations: [
        { op: "create", name: "Bad Name", description: "d", body: "b" },
        {
          op: "create",
          name: "leaky",
          description: "d",
          body: "api_key: sk-abcdefghijklmnopqrstu",
        },
        { op: "create", name: "no-body", description: "d" },
      ],
    });
    expect(parseLearningReply(reply)).toEqual([]);
  });

  it("recognizes only skills the learner wrote", () => {
    expect(isLearnedSkill("---\nname: a\ndescription: b\nlearned: true\n---\n\nbody")).toBe(true);
    expect(isLearnedSkill("---\nname: a\ndescription: b\n---\n\nbody")).toBe(false);
  });
});
