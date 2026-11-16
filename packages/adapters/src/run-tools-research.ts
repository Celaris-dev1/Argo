import { resolveResearchSettings } from "@argo/contracts";
import { recordUsage } from "@argo/db";
import { getLogger } from "@argo/logging";
import { formatCurrentTimeInstruction } from "./current-time.js";
import type { ResearchDeps } from "./research-engine.js";
import { runResearch } from "./research-engine.js";
import type { RunContext } from "./run-context.js";
import { resolveRunModel } from "./run-model.js";
import type { ToolHandlers } from "./run-tool-gate.js";
import { postWorkStatus } from "./work-status.js";

const QUESTION_MAX = 4_000;
const NUMERIC_OVERRIDES = ["questions", "sources", "rounds", "minutes", "words", "recencyDays"];

/**
 * Models raise depth on their own when a topic sounds big, which costs minutes and tokens nobody
 * asked for. Keep a deeper level or a numeric override only when the request itself names it.
 */
export function requestedResearchArgs(args: Record<string, unknown>): Record<string, unknown> {
  const question = String(args.question ?? "").toLowerCase();
  const kept: Record<string, unknown> = { ...args };
  const depth = typeof args.depth === "string" ? args.depth.toLowerCase() : undefined;
  if (
    depth &&
    depth !== "low" &&
    (!/^[a-z]+$/.test(depth) || !new RegExp(`\\b${depth}\\b`).test(question))
  )
    delete kept.depth;
  for (const key of NUMERIC_OVERRIDES) {
    const value = args[key];
    if (value === undefined) continue;
    if (!new RegExp(`\\b${Number(value)}\\b`).test(question)) delete kept[key];
  }
  return kept;
}

/** Wires the provider-neutral research engine to this run's model, web provider and status line. */
function researchDeps(ctx: RunContext, operationId: string): ResearchDeps {
  const { deps, run, context } = ctx;
  let model: Awaited<ReturnType<typeof resolveRunModel>> | undefined;
  let calls = 0;
  return {
    signal: context.signal,
    async ask({ system, prompt, signal }) {
      model ??= await resolveRunModel(deps, {
        userId: run.userId,
        spaceId: run.spaceId,
        botId: run.botId,
      });
      if (!model) throw new Error("No model is connected.");
      const callId = `${operationId}:${calls++}`;
      let text = "";
      for await (const event of deps.runtime.run(
        {
          botId: run.botId,
          threadId: run.threadId,
          runId: callId,
          usageOperationKind: "subagent",
          prompt,
          instructions: `${formatCurrentTimeInstruction()} ${system}`,
          history: [],
          tools: [],
          model,
          allowSilentEmpty: true,
        },
        {
          operationId: callId,
          traceId: callId,
          spaceId: run.spaceId,
          userId: run.userId,
          signal,
        },
      )) {
        if (event.type === "usage" && !event.accounted) {
          await recordUsage(deps.prisma, event, {
            spaceId: run.spaceId,
            userId: run.userId,
            botId: run.botId,
            operationId: callId,
            parentRunId: ctx.runId,
            operationKind: "subagent",
          }).catch(() => undefined);
        }
        if (event.type === "done" && event.text) text = event.text;
      }
      if (/^(?:I hit a problem:|Unknown model )/i.test(text.trim())) return "";
      return text;
    },
    async search({ query, maxResults, signal }) {
      const hits = await ctx.providers.web.search({ query, maxResults, signal }, context);
      return hits;
    },
    async fetch({ url, maxChars, signal }) {
      return ctx.providers.web.fetch({ url, maxChars, signal }, context);
    },
    async progress(status) {
      await postWorkStatus(ctx, `Researching — ${status}`);
    },
  };
}

/** Runs one research request and returns the tool result the model presents. */
async function researchResult(
  ctx: RunContext,
  args: Record<string, unknown>,
  operationId: string,
): Promise<Record<string, unknown>> {
  const question = String(args.question ?? "").trim();
  if (!question) return { error: "question is required" };
  if (question.length > QUESTION_MAX) {
    return { error: `question is longer than ${QUESTION_MAX} characters` };
  }
  const settings = resolveResearchSettings(requestedResearchArgs(args));
  try {
    const result = await runResearch(question, settings, researchDeps(ctx, operationId));
    getLogger().info("research.completed", {
      runId: ctx.runId,
      depth: result.stats.depth,
      read: result.stats.read,
      searches: result.stats.searches,
      elapsedMs: result.stats.elapsedMs,
    });
    return {
      report: result.report,
      stats: result.stats,
      note: result.stats.stoppedEarly
        ? "The time budget ran out, so this report uses what was gathered before then."
        : undefined,
    };
  } catch (error) {
    ctx.context.signal.throwIfAborted();
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const FORCED_RESEARCH = /^\s*(?:\/|use\s+skill:\s*)research\b[ \t]*:?([\s\S]*)$/i;

/** The request after a composer-forced `/Research`, or null when the turn did not force it. */
export function forcedResearchRequest(prompt: string): string | null {
  const question = FORCED_RESEARCH.exec(prompt)?.[1]?.trim();
  return question ? question : null;
}

/**
 * Small models often answer `/Research` from a quick search instead of calling the tool, so a
 * forced turn runs the research itself and hands the model the result to present.
 */
export async function runForcedResearch(ctx: RunContext, question: string): Promise<string> {
  const depth = /\bultra\b/i.test(question)
    ? "ultra"
    : /\bhigh\b/i.test(question)
      ? "high"
      : undefined;
  const result = await researchResult(ctx, { question, depth }, `research:${ctx.runId}:forced`);
  return `The deep_research tool already ran for this request. Its result:\n${JSON.stringify(result)}\nPresent it as the Research skill says, starting with the report itself: no preamble or status lines. Do not call deep_research again for this request.`;
}

export const researchTools: ToolHandlers = {
  async deep_research(ctx, call) {
    return call.finish(
      await researchResult(ctx, call.args, `research:${ctx.runId}:${call.executionId}`),
    );
  },
};
