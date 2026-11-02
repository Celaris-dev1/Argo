import { describe, expect, it } from "vitest";
import { stripReasoningFromReply, stripReasoningTags } from "./reasoning-tags.js";

describe("stripReasoningTags", () => {
  it("leaves ordinary text alone", () => {
    expect(stripReasoningTags("Hello <b>there</b>")).toBe("Hello <b>there</b>");
  });
  it("drops a closed think block", () => {
    expect(stripReasoningTags("<think>plan it</think>\n\nThe answer is 4.")).toBe(
      "The answer is 4.",
    );
  });
  it("drops an unclosed leading thought", () => {
    expect(stripReasoningTags("<think>still going")).toBe("");
  });
  it("drops text before an orphan closing tag", () => {
    expect(stripReasoningTags("hmm let me see</think>Done.")).toBe("Done.");
  });
  it("cleans text blocks and removes empty ones", () => {
    const result = stripReasoningFromReply("<think>x</think>Hi", [
      { kind: "text", text: "<think>x</think>" },
      { kind: "text", text: "<think>y</think>Hi" },
    ] as never);
    expect(result.assembled).toBe("Hi");
    expect(result.blocks).toEqual([{ kind: "text", text: "Hi" }]);
  });
});
