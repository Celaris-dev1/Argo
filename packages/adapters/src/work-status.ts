import { isBackgroundRunTrigger, redactSecrets } from "@rakazo/core";
import type { RunContext } from "./run-context.js";
import { publishMessage } from "./run-messages.js";
import { clampUserProgressMessage } from "./user-progress.js";

/** How often a run that is still going posts another status if nothing else did. */
export const WORK_STATUS_INTERVAL_MS = 5 * 60_000;

const STATUS_MAX_LENGTH = 240;

type StatusState = { at: number; text: string; count: number };

const statusState = new WeakMap<RunContext, StatusState>();

function stateFor(ctx: RunContext): StatusState {
  let state = statusState.get(ctx);
  if (!state) {
    state = { at: Date.now(), text: "", count: 0 };
    statusState.set(ctx, state);
  }
  return state;
}

function showsWorkStatus(ctx: RunContext): boolean {
  const trigger = ctx.run?.trigger;
  if (!trigger) return false;
  return !ctx.scripted && !isBackgroundRunTrigger(trigger) && trigger !== "reaction";
}

/** A chat message that stays, unlike the live activity line which the next token replaces. */
export async function postWorkStatus(
  ctx: RunContext,
  text: string,
  options?: { keepActivity?: boolean },
): Promise<void> {
  if (!showsWorkStatus(ctx)) return;
  const line = clampUserProgressMessage(redactSecrets(text, ctx.secrets), STATUS_MAX_LENGTH);
  if (!line) return;
  const state = stateFor(ctx);
  state.at = Date.now();
  if (!options?.keepActivity) state.text = line;
  const nonce = `work-status:${ctx.runId}:${state.count++}:${Date.now().toString(36)}`;
  await publishMessage(
    ctx.deps,
    ctx.run,
    "bot",
    [{ kind: "text", text: line }],
    false,
    nonce,
  ).catch(() => undefined);
}

/** Status for a shell the agent just started, on its computer or the user's. */
export async function postShellStatus(
  ctx: RunContext,
  command: string,
  onUserComputer: boolean,
): Promise<void> {
  const commandLine = command.replace(/\s+/g, " ").trim();
  if (!commandLine) return;
  const where = onUserComputer ? "Running on your computer" : "Running";
  await postWorkStatus(ctx, `${where}: ${commandLine}`);
}

/**
 * While the run is alive, post what it is doing every 5 minutes unless a shell
 * (or another status) already did. The timer only checks; it does not post early.
 */
export function startWorkStatusPulse(ctx: RunContext): () => void {
  if (!showsWorkStatus(ctx)) return () => undefined;
  stateFor(ctx);
  const timer = setInterval(() => {
    const state = stateFor(ctx);
    if (Date.now() - state.at < WORK_STATUS_INTERVAL_MS) return;
    const activity = state.text.replace(/^Still working — /, "");
    void postWorkStatus(ctx, activity ? `Still working — ${activity}` : "Still working.", {
      keepActivity: true,
    });
  }, 30_000);
  timer.unref?.();
  return () => clearInterval(timer);
}
