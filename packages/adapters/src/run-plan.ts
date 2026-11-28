/** The bot's plan for a request with several parts, kept for one run so it can be held to it. */
export type PlanStatus = "todo" | "doing" | "done" | "blocked";
export interface PlanItem {
  id: string;
  title: string;
  status: PlanStatus;
}
export interface RunPlan {
  items: PlanItem[];
  /** Steps since an item last moved to done (or since the plan was written). */
  stepsSinceProgress: number;
  /** Whether the bot was already pulled back in this stretch without progress. */
  nudged: boolean;
}

/** Steps without finishing a plan item before the bot is pulled back to its plan. */
export const PLAN_DRIFT_STEPS = 15;
const MAX_ITEMS = 60;
const STATUSES = new Set<PlanStatus>(["todo", "doing", "done", "blocked"]);

export function newRunPlan(): RunPlan {
  return { items: [], stepsSinceProgress: 0, nudged: false };
}

/** Replace the plan with the bot's list; returns the plan as the tool result. */
export function updateRunPlan(plan: RunPlan, args: Record<string, unknown>): string {
  const raw = Array.isArray(args.items) ? args.items : [];
  const items: PlanItem[] = [];
  for (const [index, entry] of raw.slice(0, MAX_ITEMS).entries()) {
    const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const title = String(record.title ?? "")
      .trim()
      .slice(0, 200);
    if (!title) continue;
    const status = STATUSES.has(record.status as PlanStatus)
      ? (record.status as PlanStatus)
      : "todo";
    items.push({ id: String(record.id ?? index + 1).slice(0, 20), title, status });
  }
  if (items.length === 0) return "A plan needs at least one item with a title.";
  const doneBefore = plan.items.filter((item) => item.status === "done").length;
  const doneNow = items.filter((item) => item.status === "done").length;
  if (plan.items.length === 0 || doneNow > doneBefore) {
    plan.stepsSinceProgress = 0;
    plan.nudged = false;
  }
  plan.items = items;
  return renderRunPlan(plan);
}

export function renderRunPlan(plan: RunPlan): string {
  const mark = { todo: "[ ]", doing: "[~]", done: "[x]", blocked: "[!]" } as const;
  const done = plan.items.filter((item) => item.status === "done").length;
  return [
    `Plan: ${done} of ${plan.items.length} done.`,
    ...plan.items.map((item) => `${mark[item.status]} ${item.id}. ${item.title}`),
  ].join("\n");
}

function openItems(plan: RunPlan): PlanItem[] {
  return plan.items.filter((item) => item.status === "todo" || item.status === "doing");
}

/** Count a step; when the bot has drifted, return the message that pulls it back. */
export function planDriftPrompt(plan: RunPlan): string | undefined {
  if (openItems(plan).length === 0 || plan.nudged) return undefined;
  if (plan.stepsSinceProgress < PLAN_DRIFT_STEPS) return undefined;
  plan.nudged = true;
  const open = openItems(plan)
    .slice(0, 12)
    .map((item) => `${item.id}. ${item.title}`)
    .join("; ");
  return `You have taken ${plan.stepsSinceProgress} steps without finishing an item on your plan. Still open: ${open}. Go back to those items now. If something you are doing is not on the plan, drop it unless the person asked for it. If an item is blocked, mark it blocked and move on, or tell the person what you need.`;
}
