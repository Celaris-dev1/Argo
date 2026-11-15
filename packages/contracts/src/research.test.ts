import { describe, expect, it } from "vitest";
import {
  normalizeResearchDomains,
  RESEARCH_LIMITS,
  RESEARCH_PRESETS,
  resolveResearchSettings,
} from "./research.js";

describe("research settings", () => {
  it("defaults to the low preset", () => {
    const settings = resolveResearchSettings();
    expect(settings.depth).toBe("low");
    expect(settings.questions).toBe(RESEARCH_PRESETS.low.questions);
    expect(settings.format).toBe("report");
    expect(settings.includeDomains).toEqual([]);
    expect(settings.recencyDays).toBeUndefined();
  });

  it("scales high to about three times low and ultra to about five", () => {
    const low = RESEARCH_PRESETS.low;
    expect(RESEARCH_PRESETS.high.questions).toBe(low.questions * 3);
    expect(RESEARCH_PRESETS.high.sources).toBe(low.sources * 3);
    expect(RESEARCH_PRESETS.ultra.questions).toBe(low.questions * 5);
    expect(RESEARCH_PRESETS.ultra.sources).toBe(low.sources * 5);
    expect(RESEARCH_PRESETS.ultra.verification).toBe("skeptic");
  });

  it("applies and clamps user adjustments", () => {
    const settings = resolveResearchSettings({
      depth: "ULTRA",
      questions: 999,
      sources: "12",
      rounds: 0,
      verification: "two-sources",
      recencyDays: 30,
      format: "table",
    });
    expect(settings.depth).toBe("ultra");
    expect(settings.questions).toBe(RESEARCH_LIMITS.questions.max);
    expect(settings.sources).toBe(12);
    expect(settings.rounds).toBe(RESEARCH_LIMITS.rounds.min);
    expect(settings.verification).toBe("two-sources");
    expect(settings.recencyDays).toBe(30);
    expect(settings.format).toBe("table");
  });

  it("falls back on unknown values", () => {
    const settings = resolveResearchSettings({
      depth: "max",
      verification: "vibes" as never,
      sources: Number.NaN,
    });
    expect(settings.depth).toBe("low");
    expect(settings.verification).toBe("none");
    expect(settings.sources).toBe(RESEARCH_PRESETS.low.sources);
  });

  it("normalizes domain lists", () => {
    expect(
      normalizeResearchDomains("https://www.Gov.uk/visas, *.nature.com not a host  bbc.co.uk."),
    ).toEqual(["gov.uk", "nature.com", "bbc.co.uk"]);
    expect(normalizeResearchDomains(["a.com", 3, "a.com"])).toEqual(["a.com"]);
    expect(normalizeResearchDomains(undefined)).toEqual([]);
  });
});
