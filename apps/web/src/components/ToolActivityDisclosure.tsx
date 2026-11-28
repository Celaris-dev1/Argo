import { ChatMarkdown } from "@argo/chat-ui/web";
import type { ThreadMessage } from "@argo/contracts";
import { formatCompactDuration } from "@argo/core";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@argo/ui-web/components/ui/collapsible";
import { Plural, Trans } from "@lingui/react/macro";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment } from "react";
import { toolStepCount } from "../lib/tool-activity-view";

type ToolStep = Extract<ThreadMessage["blocks"][number], { kind: "steps" }>["steps"][number];

/** While a run is live, only the most recent steps are listed so a long run does not push the chat down. */
export const LIVE_TOOL_STEP_WINDOW = 6;

export function ToolSteps({
  steps,
  currentIndex,
  limit,
}: {
  steps: readonly ToolStep[];
  currentIndex?: number;
  /** Show only the last `limit` steps, with a count of the earlier ones above them. */
  limit?: number;
}) {
  const hidden = limit !== undefined && steps.length > limit ? steps.length - limit : 0;
  const shown = hidden > 0 ? steps.slice(hidden) : steps;
  return (
    <div className="space-y-0.5" data-testid="tool-rows">
      {hidden > 0 ? (
        <div className="text-[12px] leading-5 text-muted-foreground" data-testid="tool-rows-hidden">
          <Plural value={hidden} one="+# earlier step" other="+# earlier steps" />
        </div>
      ) : null}
      {shown.map((step, offset) => {
        const index = hidden + offset;
        const isCurrent = index === currentIndex;
        return (
          <Fragment key={index}>
            {step.note ? (
              <div className="py-1 text-[13px] text-foreground/75" data-testid="tool-step-note">
                <ChatMarkdown>{step.note}</ChatMarkdown>
              </div>
            ) : null}
            <div className="flex min-w-0 items-center gap-2 leading-5">
              <span
                className={`text-[12px] ${isCurrent ? "text-warning" : "text-success"}`}
                style={{ animation: isCurrent ? "rkPulse 1.2s ease-in-out infinite" : undefined }}
              >
                {isCurrent ? "◷" : "✓"}
              </span>
              <span
                className={`min-w-0 flex-1 truncate text-[13px] ${
                  isCurrent ? "text-foreground" : "text-muted-foreground"
                }`}
                title={step.label}
              >
                {step.label}
                {step.count > 1 ? ` ×${step.count}` : ""}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * The tool-activity card. It stays folded so a long run does not fill the chat; while the
 * run is live the folded line names the step it is on.
 */
export function ToolActivityDisclosure({
  live,
  stepCount,
  durationMs,
  current,
  children,
}: {
  live: boolean;
  stepCount: number;
  durationMs?: number;
  /** The step running now, shown on the folded line while live. */
  current?: string;
  children: ReactNode;
}) {
  const duration = formatCompactDuration(durationMs);
  const toolCount = stepCount;
  return (
    <Collapsible
      defaultOpen={false}
      data-testid="tool-activity"
      data-live={live || undefined}
      className="group"
    >
      <CollapsibleTrigger
        className={`flex min-h-6 w-fit cursor-pointer list-none items-center gap-1 rounded-md py-0.5 pe-1.5 text-[13px] font-medium outline-none hover:text-foreground/75 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          live ? "text-foreground/75" : "text-muted-foreground"
        }`}
      >
        <ChevronRight
          aria-hidden
          size={14}
          strokeWidth={1.8}
          className="transition-transform duration-150 group-data-panel-open:rotate-90 motion-reduce:transition-none"
        />
        <span className="flex items-center gap-2">
          <span>{live ? <Trans>Working…</Trans> : <Trans>Done</Trans>}</span>
          <span>
            <Plural value={toolCount} one="# tool" other="# tools" />
          </span>
          {!live && duration ? <span>{duration}</span> : null}
          {live && current ? (
            <span
              className="max-w-[40ch] truncate font-normal text-muted-foreground"
              data-testid="tool-activity-current"
              title={current}
            >
              {current}
            </span>
          ) : null}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent hiddenUntilFound>
        <div className="ms-[7px] mt-0.5 border-s border-border ps-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * A tools-only message: a plain muted line between messages, not a chat bubble.
 */
export function StandaloneToolActivity({
  live,
  steps,
  stepCount,
  durationMs,
}: {
  live: boolean;
  steps: readonly ToolStep[];
  stepCount: number;
  durationMs?: number;
}) {
  return (
    <div className="flex justify-start" dir="ltr" data-testid="tool-activity-line">
      <div className="max-w-full min-w-0 ps-1">
        <ToolActivityDisclosure
          live={live}
          stepCount={stepCount}
          durationMs={durationMs}
          current={live ? steps.at(-1)?.label : undefined}
        >
          <ToolSteps
            steps={steps}
            currentIndex={live ? steps.length - 1 : undefined}
            limit={live ? LIVE_TOOL_STEP_WINDOW : undefined}
          />
        </ToolActivityDisclosure>
      </div>
    </div>
  );
}

/** A bot message whose only visible blocks are tool cards: one slim folded line, no bubble. */
export function ToolOnlyNarration({
  blocks,
  live,
}: {
  blocks: readonly ThreadMessage["blocks"][number][];
  live: boolean;
}) {
  const cards = blocks.filter(
    (block): block is Extract<ThreadMessage["blocks"][number], { kind: "steps" }> =>
      block.kind === "steps",
  );
  if (cards.length === 0) return null;
  const steps = cards.flatMap((card) => card.steps);
  const durations = cards.map((card) => card.durationMs).filter((ms) => ms !== undefined);
  return (
    <StandaloneToolActivity
      live={live}
      steps={steps}
      stepCount={toolStepCount(steps)}
      durationMs={durations.length ? durations.reduce((sum, ms) => sum + ms, 0) : undefined}
    />
  );
}
