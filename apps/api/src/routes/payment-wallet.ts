import { PaymentWalletRequestRejected } from "@argo/adapter-kit";
import type { PaymentWalletDeps } from "@argo/adapters";
import {
  botSpentThisMonth,
  connectPaymentWallet,
  disconnectPaymentWallet,
  paymentWalletStatus,
} from "@argo/adapters";
import type { Actor } from "@argo/contracts";
import { IsolationError, recordSecurityEvent } from "@argo/db";
import { ORPCError } from "@orpc/server";
import { paymentWalletConnectedEvent } from "../security-audit.js";
import type { RouterContext } from "./context.js";

export function paymentWalletRoutes(ctx: RouterContext) {
  const { deps, authed } = ctx;
  const wallet: PaymentWalletDeps = {
    prisma: deps.prisma,
    secretStore: deps.secrets,
    paymentWallet: deps.paymentWallet,
  };
  /** Only the bot's owner reads or changes its budget; a bot never can. */
  async function ownBot(actor: Actor, botId: string) {
    const bot = await deps.prisma.bot.findFirst({
      where: { id: botId, spaceId: actor.spaceId, userId: actor.userId },
      select: { id: true },
    });
    if (!bot) throw new IsolationError();
  }
  return {
    paymentWallet: {
      status: authed.paymentWallet.status.handler(({ context }) =>
        paymentWalletStatus(wallet, context.actor, {
          onConnected: () => recordSecurityEvent(paymentWalletConnectedEvent(context.actor)),
        }),
      ),
      connect: authed.paymentWallet.connect.handler(async ({ context }) => {
        if (!deps.paymentWallet) throw new ORPCError("NOT_FOUND");
        try {
          return await connectPaymentWallet(wallet, context.actor);
        } catch (error) {
          if (error instanceof PaymentWalletRequestRejected)
            throw new ORPCError("BAD_REQUEST", { message: error.message });
          throw error;
        }
      }),
      disconnect: authed.paymentWallet.disconnect.handler(({ context }) =>
        disconnectPaymentWallet(wallet, context.actor),
      ),
      botBudget: authed.paymentWallet.botBudget.handler(async ({ context, input }) => {
        await ownBot(context.actor, input.botId);
        const budget = await deps.prisma.botBudget.findUnique({ where: { botId: input.botId } });
        const currency = budget?.currency ?? "usd";
        return {
          monthlyLimit: budget?.monthlyLimit ?? null,
          currency,
          spentThisMonth: await botSpentThisMonth(deps.prisma, input.botId, currency),
        };
      }),
      setBotBudget: authed.paymentWallet.setBotBudget.handler(async ({ context, input }) => {
        await ownBot(context.actor, input.botId);
        if (input.monthlyLimit === null) {
          await deps.prisma.botBudget.deleteMany({
            where: { botId: input.botId, userId: context.actor.userId },
          });
        } else {
          await deps.prisma.botBudget.upsert({
            where: { botId: input.botId },
            create: {
              botId: input.botId,
              spaceId: context.actor.spaceId,
              userId: context.actor.userId,
              monthlyLimit: input.monthlyLimit,
              currency: input.currency,
            },
            update: { monthlyLimit: input.monthlyLimit, currency: input.currency },
          });
        }
        return { ok: true as const };
      }),
    },
  };
}
