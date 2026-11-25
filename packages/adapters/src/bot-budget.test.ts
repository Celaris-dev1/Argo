import { describe, expect, it, vi } from "vitest";
import { botSpentThisMonth, budgetRefusal, monthStart } from "./bot-budget.js";

function fake(budget: unknown, spent: number | null) {
  return {
    botBudget: { findUnique: vi.fn(async () => budget) },
    purchase: {
      aggregate: vi.fn(async (_args: { where: Record<string, unknown> }) => ({
        _sum: { amount: spent },
      })),
    },
  };
}
const now = new Date("2026-11-22T12:00:00Z");

describe("bot budget", () => {
  it("counts the calendar month in UTC and leaves out purchases that took no money", async () => {
    expect(monthStart(now).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    const prisma = fake(null, 1250);
    expect(await botSpentThisMonth(prisma as never, "b", "usd", now)).toBe(1250);
    const where = prisma.purchase.aggregate.mock.calls[0]?.[0].where;
    expect(where?.status).toEqual({ notIn: ["denied", "expired", "canceled", "failed"] });
    expect(where?.createdAt).toEqual({ gte: new Date("2026-11-01T00:00:00Z") });
    expect(await botSpentThisMonth(fake(null, null) as never, "b", "usd", now)).toBe(0);
  });

  it("allows anything without a budget", async () => {
    const prisma = fake(null, 0);
    expect(await budgetRefusal(prisma as never, "b", { amount: 99_999, currency: "usd" })).toBe(
      undefined,
    );
    expect(prisma.purchase.aggregate).not.toHaveBeenCalled();
  });

  it("allows a purchase up to the limit and refuses one past it", async () => {
    const budget = { monthlyLimit: 2000, currency: "usd" };
    expect(
      await budgetRefusal(fake(budget, 1500) as never, "b", { amount: 500, currency: "USD" }, now),
    ).toBeUndefined();
    const refusal = await budgetRefusal(
      fake(budget, 1500) as never,
      "b",
      { amount: 501, currency: "usd" },
      now,
    );
    expect(refusal).toMatch(/over this bot's monthly budget/);
    expect(refusal).toContain("500 of 2000");
  });

  it("refuses another currency rather than skipping the limit", async () => {
    const refusal = await budgetRefusal(
      fake({ monthlyLimit: 2000, currency: "usd" }, 0) as never,
      "b",
      { amount: 1, currency: "eur" },
      now,
    );
    expect(refusal).toMatch(/budget is in USD/);
  });
});
