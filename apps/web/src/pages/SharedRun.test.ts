import { describe, expect, it } from "vitest";
import { shareMarkdown } from "./SharedRun.js";

describe("shareMarkdown", () => {
  it("names the file after the prompt and keeps the report and attribution", () => {
    const file = shareMarkdown({
      botName: "Chief",
      prompt: "Cheapest ways to send money to Nigeria?",
      result: "1. Option A [1]\n\nSources\n[1] https://a.example",
      steps: [],
      createdAt: "2026-11-16T00:00:00.000Z",
    });
    expect(file.name).toBe("cheapest-ways-to-send-money-to-nigeria.md");
    expect(file.text).toContain("# Cheapest ways to send money to Nigeria?");
    expect(file.text).toContain("[1] https://a.example");
    expect(file.text).toContain("Made with Argo");
  });
});
