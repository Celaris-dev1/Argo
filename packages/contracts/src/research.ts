/** Deep research depth. Each level is a preset the user can adjust per request. */
export const RESEARCH_DEPTHS = ["low", "high", "ultra"] as const;
export type ResearchDepth = (typeof RESEARCH_DEPTHS)[number];

/** How claims are checked before the report is written. */
export const RESEARCH_VERIFICATIONS = ["none", "two-sources", "skeptic"] as const;
export type ResearchVerification = (typeof RESEARCH_VERIFICATIONS)[number];

export const RESEARCH_FORMATS = ["report", "brief", "table"] as const;
export type ResearchFormat = (typeof RESEARCH_FORMATS)[number];

export interface ResearchSettings {
  depth: ResearchDepth;
  /** Sub-questions planned in the first round. */
  questions: number;
  /** Pages read across all rounds. */
  sources: number;
  /** Search-and-read rounds; later rounds chase gaps the earlier ones left. */
  rounds: number;
  verification: ResearchVerification;
  /** Wall-clock budget for the whole job. */
  minutes: number;
  /** Target report length. */
  words: number;
  format: ResearchFormat;
  /** Only keep sources published or updated within this many days, when the page says. */
  recencyDays?: number;
  /** When set, only these sites are read. */
  includeDomains: string[];
  excludeDomains: string[];
}

type Preset = Omit<ResearchSettings, "depth" | "format" | "includeDomains" | "excludeDomains">;

export const RESEARCH_PRESETS: Record<ResearchDepth, Preset> = {
  low: { questions: 8, sources: 40, rounds: 1, verification: "none", minutes: 6, words: 1500 },
  high: {
    questions: 24,
    sources: 120,
    rounds: 2,
    verification: "two-sources",
    minutes: 18,
    words: 4000,
  },
  ultra: {
    questions: 40,
    sources: 200,
    rounds: 3,
    verification: "skeptic",
    minutes: 45,
    words: 7000,
  },
};

export const RESEARCH_LIMITS = {
  questions: { min: 1, max: 60 },
  sources: { min: 3, max: 300 },
  rounds: { min: 1, max: 4 },
  minutes: { min: 2, max: 90 },
  words: { min: 300, max: 10_000 },
  recencyDays: { min: 1, max: 3650 },
  domains: 20,
} as const;

/** Loose input (tool arguments, form values); every field is validated and clamped. */
export type ResearchOverrides = { [K in keyof ResearchSettings]?: unknown };

function clampInt(value: unknown, fallback: number, range: { min: number; max: number }): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(n)));
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (options as readonly string[]).includes(text) ? (text as T) : fallback;
}

/** Bare hostnames: "https://www.Gov.uk/x" becomes "gov.uk". Invalid entries are dropped. */
export function normalizeResearchDomains(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,]+/)
      : [];
  const out = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string") continue;
    const host = item
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, "")
      .replace(/[/?#].*$/, "")
      .replace(/^\*\./, "")
      .replace(/^www\./, "")
      .replace(/\.$/, "");
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) out.add(host);
    if (out.size >= RESEARCH_LIMITS.domains) break;
  }
  return [...out];
}

/** The level's preset with the user's adjustments applied and clamped to safe limits. */
export function resolveResearchSettings(overrides: ResearchOverrides = {}): ResearchSettings {
  const depth = oneOf(overrides.depth, RESEARCH_DEPTHS, "low");
  const preset = RESEARCH_PRESETS[depth];
  const recency =
    overrides.recencyDays === undefined || overrides.recencyDays === null
      ? undefined
      : clampInt(overrides.recencyDays, 0, RESEARCH_LIMITS.recencyDays);
  return {
    depth,
    questions: clampInt(overrides.questions, preset.questions, RESEARCH_LIMITS.questions),
    sources: clampInt(overrides.sources, preset.sources, RESEARCH_LIMITS.sources),
    rounds: clampInt(overrides.rounds, preset.rounds, RESEARCH_LIMITS.rounds),
    verification: oneOf(overrides.verification, RESEARCH_VERIFICATIONS, preset.verification),
    minutes: clampInt(overrides.minutes, preset.minutes, RESEARCH_LIMITS.minutes),
    words: clampInt(overrides.words, preset.words, RESEARCH_LIMITS.words),
    format: oneOf(overrides.format, RESEARCH_FORMATS, "report"),
    ...(recency ? { recencyDays: recency } : {}),
    includeDomains: normalizeResearchDomains(overrides.includeDomains),
    excludeDomains: normalizeResearchDomains(overrides.excludeDomains),
  };
}
