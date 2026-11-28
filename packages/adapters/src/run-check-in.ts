import type { ToolCallBudget } from "./pi-runtime-tools.js";

/** Steps a bot may take without hearing from its person before it must report back. */
export const CHECK_IN_STEPS = 40;
/** Time a bot may work without hearing from its person before it must report back. */
export const CHECK_IN_MS = 20 * 60_000;
/** Calls still allowed after the check-in, so the bot can finish the step it is on. */
export const CHECK_IN_GRACE_CALLS = 5;

export const CHECK_IN_PROMPT =
  "You have been working for a while without hearing from the person. Stop here: tell them in a few lines what you finished, what is left, and ask whether to continue. Do not run another command in this turn.";

export interface CheckIn {
  steps: number;
  since: number;
  sent: boolean;
  /** The run's own tool-call fuse before the check-in tightened it. */
  baseLimit: number;
}

export function newCheckIn(host: { toolCallBudget: ToolCallBudget }, now = Date.now()): CheckIn {
  return { steps: 0, since: now, sent: false, baseLimit: host.toolCallBudget.limit };
}

/** Only a run with a person in the chat checks in; routines and webhooks run to the end. */
export function dueForCheckIn(checkIn: CheckIn, personPresent: boolean, now = Date.now()): boolean {
  if (!personPresent || checkIn.sent) return false;
  return checkIn.steps >= CHECK_IN_STEPS || now - checkIn.since >= CHECK_IN_MS;
}

/** After the check-in, a bot that keeps going is stopped a few calls later. */
export function requestCheckIn(checkIn: CheckIn, host: { toolCallBudget: ToolCallBudget }) {
  checkIn.sent = true;
  const budget = host.toolCallBudget;
  budget.checkIn = true;
  const cap = budget.count + CHECK_IN_GRACE_CALLS;
  budget.limit = budget.limit > 0 ? Math.min(budget.limit, cap) : cap;
}

/** A message from the person starts a fresh allowance. */
export function resetCheckIn(
  checkIn: CheckIn,
  host: { toolCallBudget: ToolCallBudget },
  now = Date.now(),
) {
  if (checkIn.sent && !host.toolCallBudget.exceeded) {
    host.toolCallBudget.limit = checkIn.baseLimit;
    host.toolCallBudget.checkIn = false;
  }
  checkIn.steps = 0;
  checkIn.since = now;
  checkIn.sent = false;
}
