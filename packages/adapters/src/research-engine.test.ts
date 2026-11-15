import { resolveResearchSettings } from "@argo/contracts";
import { describe, expect, it } from "vitest";
import type { ResearchDeps } from "./research-engine.js";
import { allowedUrl, checkCitations, isStale, parseJson, runResearch } from "./research-engine.js";

type Calls = { plan: number; extract: number; gaps: number; skeptic: number; write: number };

function fakeDeps(options: {
  hostsPerQuery?: string[];
  gapQueries?: string[][];
  failSearch?: (query: string) => boolean;
  shortPage?: (url: string) => boolean;
  writeReply?: (prompt: string) => string;
  now?: () => number;
  signal?: AbortSignal;
}) {
  const calls: Calls = { plan: 0, extract: 0, gaps: 0, skeptic: 0, write: 0 };
  const searched: string[] = [];
  const fetched: string[] = [];
  const statuses: string[] = [];
  const hosts = options.hostsPerQuery ?? ["a.com", "b.org", "c.net", "d.io"];
  let gapCall = 0;
  const deps: ResearchDeps = {
    signal: options.signal ?? new AbortController().signal,
    searchPauseMs: 0,
    ...(options.now ? { now: options.now } : {}),
    async ask({ prompt }) {
      if (prompt.startsWith("Break this research request")) {
        calls.plan++;
        const n = Number(/into (\d+) distinct/.exec(prompt)?.[1] ?? 3);
        return JSON.stringify({ queries: Array.from({ length: n }, (_, i) => `query ${i + 1}`) });
      }
      if (prompt.startsWith("Extract the facts")) {
        calls.extract++;
        const title = /<page title="([^"]*)"/.exec(prompt)?.[1] ?? "page";
        return `\`\`\`json\n{"facts":[{"claim":"Fact from ${title}","quote":"quoted"}]}\n\`\`\``;
      }
      if (prompt.startsWith("Here is what research found")) {
        calls.gaps++;
        return JSON.stringify({ queries: options.gapQueries?.[gapCall++] ?? [] });
      }
      if (prompt.startsWith("You are a sceptic")) {
        calls.skeptic++;
        return JSON.stringify({ queries: ["counter evidence"] });
      }
      calls.write++;
      return options.writeReply
        ? options.writeReply(prompt)
        : "Summary of the answer with enough words to count as a paragraph of real report text [1][2].\n\nA second paragraph that cites a source that does not exist, and it is long enough to be counted [99].";
    },
    async search({ query }) {
      searched.push(query);
      if (options.failSearch?.(query)) throw new Error("rate limited");
      return hosts.map((host, i) => ({
        title: `${query} on ${host}`,
        url: `https://www.${host}/${encodeURIComponent(query)}/${i}?utm_source=x`,
        snippet: "",
      }));
    },
    async fetch({ url }) {
      fetched.push(url);
      const text = options.shortPage?.(url) ? "tiny" : `Body of ${url}. `.repeat(20);
      return { url, title: `Title ${fetched.length}`, text };
    },
    async progress(status) {
      statuses.push(status);
    },
  };
  return { deps, calls, searched, fetched, statuses };
}

describe("runResearch", () => {
  it("runs a low job: plans, reads within budget, cites, and lists only cited sources", async () => {
    const settings = resolveResearchSettings({ depth: "low", sources: 10 });
    const { deps, calls, fetched, statuses } = fakeDeps({});
    const result = await runResearch("Best phone under 300k naira", settings, deps);
    expect(calls.plan).toBe(1);
    expect(calls.gaps).toBe(0);
    expect(calls.skeptic).toBe(0);
    expect(fetched.length).toBe(10);
    expect(result.stats.read).toBe(10);
    expect(result.stats.rounds).toBe(1);
    expect(result.report).not.toContain("[99]");
    expect(result.report).toContain("## Sources");
    expect(result.sources.map((s) => s.n)).toEqual([1, 2]);
    expect(result.stats.uncitedParagraphs).toBe(1);
    expect(statuses[0]).toMatch(/^Planning/);
    expect(statuses.at(-1)).toMatch(/^Writing the report/);
  });

  it("spreads sources across questions before reading many from one", async () => {
    const settings = resolveResearchSettings({ depth: "low", questions: 4, sources: 4 });
    const { deps, fetched } = fakeDeps({});
    await runResearch("q", settings, deps);
    const queries = fetched.map((url) => decodeURIComponent(url.split("/")[3]!));
    expect(new Set(queries).size).toBe(4);
  });

  it("chases gaps in later rounds and stops when none remain", async () => {
    const settings = resolveResearchSettings({ depth: "high", questions: 2, sources: 30 });
    const { deps, calls, searched } = fakeDeps({ gapQueries: [["gap one", "gap two"]] });
    const result = await runResearch("q", settings, deps);
    expect(calls.gaps).toBe(1);
    expect(searched).toContain("gap one");
    expect(result.stats.rounds).toBe(2);
    expect(result.stats.questions).toBe(4);
  });

  it("asks for two-source verification on high", async () => {
    let writePrompt = "";
    const settings = resolveResearchSettings({ depth: "high", questions: 1, sources: 4 });
    const { deps } = fakeDeps({
      writeReply: (prompt) => {
        writePrompt = prompt;
        return "ok [1]";
      },
    });
    await runResearch("q", settings, deps);
    expect(writePrompt).toContain("two or more different sources");
    expect(writePrompt).not.toContain("What could be wrong");
  });

  it("runs a sceptic pass on ultra and marks counter sources", async () => {
    let writePrompt = "";
    const settings = resolveResearchSettings({
      depth: "ultra",
      questions: 2,
      sources: 8,
      rounds: 1,
    });
    const { deps, calls, searched } = fakeDeps({
      writeReply: (prompt) => {
        writePrompt = prompt;
        return "ok [1]";
      },
    });
    const result = await runResearch("q", settings, deps);
    expect(calls.skeptic).toBe(1);
    expect(searched).toContain("counter evidence");
    expect(writePrompt).toContain("COUNTER");
    expect(writePrompt).toContain("What could be wrong");
    expect(result.stats.read).toBeGreaterThan(8);
  });

  it("only reads allowed sites", async () => {
    const settings = resolveResearchSettings({
      depth: "low",
      questions: 2,
      sources: 20,
      excludeDomains: ["b.org"],
    });
    const { deps, fetched } = fakeDeps({});
    await runResearch("q", settings, deps);
    expect(fetched.some((url) => url.includes("b.org"))).toBe(false);
    expect(fetched.length).toBeGreaterThan(0);

    const only = resolveResearchSettings({ questions: 2, includeDomains: ["c.net"] });
    const second = fakeDeps({});
    await runResearch("q", only, second.deps);
    expect(second.fetched.every((url) => url.includes("c.net"))).toBe(true);
    expect(second.searched.every((query) => query.endsWith("site:c.net"))).toBe(true);
  });

  it("survives failed searches and unreadable pages", async () => {
    const settings = resolveResearchSettings({ questions: 3, sources: 12 });
    const { deps } = fakeDeps({
      failSearch: (query) => query === "query 2",
      shortPage: (url) => url.includes("a.com"),
    });
    const result = await runResearch("q", settings, deps);
    expect(result.stats.read).toBeGreaterThan(0);
    expect(result.report).toContain("[1]");
  });

  it("says so plainly when nothing could be read", async () => {
    const settings = resolveResearchSettings({ questions: 2, sources: 5 });
    const { deps, calls } = fakeDeps({ failSearch: () => true });
    const result = await runResearch("q", settings, deps);
    expect(calls.write).toBe(0);
    expect(result.report).toMatch(/couldn't gather enough readable sources/);
    expect(result.sources).toEqual([]);
  });

  it("stops researching when the time budget runs out and still writes", async () => {
    let t = 0;
    const settings = resolveResearchSettings({ depth: "high", minutes: 2, questions: 6 });
    const { deps, calls } = fakeDeps({ now: () => (t += 3_000) });
    const result = await runResearch("q", settings, deps);
    expect(result.stats.stoppedEarly).toBe(true);
    expect(calls.write).toBe(1);
  });

  it("stops on abort", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stopped"));
    const { deps } = fakeDeps({ signal: controller.signal });
    await expect(runResearch("q", resolveResearchSettings(), deps)).rejects.toThrow("stopped");
  });
});

describe("research helpers", () => {
  it("checks citations and drops a model-written sources list", () => {
    const sources = [
      { n: 1, title: "One [x]", url: "https://one.example", counter: false },
      { n: 2, title: "Two", url: "https://two.example", counter: false },
    ];
    const out = checkCitations(
      "Answer with a citation long enough to count as a paragraph here [2] and [7].\n\n## Sources\n1. made up",
      sources,
    );
    expect(out.report).not.toContain("made up");
    expect(out.report).not.toContain("[7]");
    expect(out.cited.map((s) => s.n)).toEqual([2]);
    expect(out.report).toContain("1. [Two](https://two.example)".replace("1.", "2."));
    expect(out.uncitedParagraphs).toBe(0);
  });

  it("filters URLs by site", () => {
    const s = resolveResearchSettings({ includeDomains: ["gov.uk"], excludeDomains: ["x.gov.uk"] });
    expect(allowedUrl("https://www.gov.uk/visa", s)).toBe(true);
    expect(allowedUrl("https://travel.gov.uk/a", s)).toBe(true);
    expect(allowedUrl("https://x.gov.uk/a", s)).toBe(false);
    expect(allowedUrl("https://notgov.uk/a", s)).toBe(false);
    expect(allowedUrl("ftp://gov.uk/a", s)).toBe(false);
  });

  it("treats a page as stale only when every year it states is too old", () => {
    const now = () => Date.UTC(2026, 10, 15);
    expect(isStale("Updated 2019. Prices from 2018.", 365, now)).toBe(true);
    expect(isStale("Since 2019, now in 2026.", 365, now)).toBe(false);
    expect(isStale("No dates here.", 30, now)).toBe(false);
  });

  it("parses JSON wrapped in prose or fences", () => {
    expect(parseJson('Sure: {"a": [1]} done')).toEqual({ a: [1] });
    expect(parseJson("```json\n[1,2]\n```")).toEqual([1, 2]);
    expect(parseJson("no json")).toBeNull();
  });
});
