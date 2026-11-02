import type { Actor } from "@rakazo/contracts";
import type { Prisma } from "@rakazo/db";

/** A connection the user just added belongs to every chat they already have. */
export async function grantMcpServerToExistingBots(
  tx: Prisma.TransactionClient,
  actor: Pick<Actor, "userId">,
  serverId: string,
) {
  const server = await tx.mcpServer.findFirst({
    where: { id: serverId, userId: actor.userId },
    select: {
      id: true,
      spaceId: true,
      allSpaces: true,
      availableIn: { select: { spaceId: true } },
    },
  });
  if (!server) return;
  const spaces = [server.spaceId, ...server.availableIn.map((row) => row.spaceId)];
  const bots = await tx.bot.findMany({
    where: {
      userId: actor.userId,
      archivedAt: null,
      ...(server.allSpaces ? {} : { spaceId: { in: spaces } }),
    },
    select: { id: true, spaceId: true },
  });
  if (bots.length === 0) return;
  await tx.botMcpServer.createMany({
    data: bots.map((bot) => ({
      spaceId: bot.spaceId,
      userId: actor.userId,
      botId: bot.id,
      serverId: server.id,
      allowAllTools: true,
      allowedTools: [],
    })),
    skipDuplicates: true,
  });
}
