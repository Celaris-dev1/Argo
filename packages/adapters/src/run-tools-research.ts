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

export const researchTools: ToolHandlers = {
  async deep_research(ctx, call) {
    const question = String(call.args.question ?? "").trim();
    if (!question) return call.finish({ error: "question is required" });
    if (question.length > QUESTION_MAX) {
      return call.finish({ error: `question is longer than ${QUESTION_MAX} characters` });
    }
    const settings = resolveResearchSettings(requestedResearchArgs(call.args));
    const deps = researchDeps(ctx, `research:${ctx.runId}:${call.executionId}`);
    try {
      const result = await runResearch(question, settings, deps);
      getLogger().info("research.completed", {
        runId: ctx.runId,
        depth: result.stats.depth,
        read: result.stats.read,
        searches: result.stats.searches,
        elapsedMs: result.stats.elapsedMs,
      });
      return call.finish({
        report: result.report,
        stats: result.stats,
        note: result.stats.stoppedEarly
          ? "The time budget ran out, so this report uses what was gathered before then."
          : undefined,
      });
    } catch (error) {
      ctx.context.signal.throwIfAborted();
      return call.finish({ error: error instanceof Error ? error.message : String(error) });
    }
  },
};
