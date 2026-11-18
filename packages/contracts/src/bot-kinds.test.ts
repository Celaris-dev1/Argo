import { describe, expect, it } from "vitest";
import { BOT_KINDS, DEFAULT_STARTERS, startersFor } from "./bot-kinds.js";

describe("bot kinds", () => {
  it("gives every kind but custom its own starters", () => {
    for (const kind of BOT_KINDS) {
      expect(kind.starters.length > 0).toBe(kind.id !== "custom");
    }
    expect(new Set(BOT_KINDS.map((kind) => kind.id)).size).toBe(BOT_KINDS.length);
  });

  it("matches a bot to its kind by untouched instructions", () => {
    const coder = BOT_KINDS.find((kind) => kind.id === "coder")!;
    expect(startersFor(coder.instructions)).toEqual(coder.starters);
  });

  it("falls back to the defaults for edited, empty or custom instructions", () => {
    expect(startersFor("My own words")).toEqual(DEFAULT_STARTERS);
    expect(startersFor("")).toEqual(DEFAULT_STARTERS);
    expect(startersFor(null)).toEqual(DEFAULT_STARTERS);
  });
});
