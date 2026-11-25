import type { PrismaClient } from "@argo/db";

/** Purchases that never took money; everything else, pending included, counts against a budget. */
const UNSPENT_STATUSES = ["denied", "expired", "canceled", "failed"];

export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** What the bot has spent this calendar month (UTC) in the budget's currency, in minor units. */
export async function botSpentThisMonth(
  prisma: Pick<PrismaClient, "purchase">,
  botId: string,
  currency: string,
  now = new Date(),
): Promise<number> {
  const total = await prisma.purchase.aggregate({
    where: {
      botId,
      currency: { equals: currency, mode: "insensitive" },
      status: { notIn: UNSPENT_STATUSES },
      createdAt: { gte: monthStart(now) },
    },
    _sum: { amount: true },
  });
  return total._sum.amount ?? 0;
}

/**
 * Why a purchase would break the bot's monthly budget, or undefined when it fits or the bot has
 * no budget. A purchase in another currency than the budget's is refused, so a limit can't be
 * stepped around by paying in a different one.
 */
export async function budgetRefusal(
  prisma: Pick<PrismaClient, "botBudget" | "purchase">,
  botId: string,
  request: { amount: number; currency: string },
  now = new Date(),
): Promise<string | undefined> {
  const budget = await prisma.botBudget.findUnique({ where: { botId } });
  if (!budget) return undefined;
  if (budget.currency.toLowerCase() !== request.currency.toLowerCase()) {
    return `This bot's budget is in ${budget.currency.toUpperCase()}; it can't pay in ${request.currency.toUpperCase()}. Ask the user to change the budget or pay themselves.`;
  }
  const spent = await botSpentThisMonth(prisma, botId, budget.currency, now);
  if (spent + request.amount <= budget.monthlyLimit) return undefined;
  const left = Math.max(0, budget.monthlyLimit - spent);
  return `This purchase is over this bot's monthly budget (${left} of ${budget.monthlyLimit} ${budget.currency.toUpperCase()} minor units left). Tell the user; only they can raise the budget.`;
}
