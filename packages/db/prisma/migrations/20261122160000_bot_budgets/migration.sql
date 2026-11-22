-- Additive: older releases never read or write this table.
CREATE TABLE "bot_budgets" (
    "botId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlyLimit" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_budgets_pkey" PRIMARY KEY ("botId")
);

CREATE INDEX "bot_budgets_spaceId_userId_idx" ON "bot_budgets"("spaceId", "userId");

ALTER TABLE "bot_budgets" ADD CONSTRAINT "bot_budgets_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bot_budgets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY bot_budgets_system ON "bot_budgets" USING (current_setting('app.rls_bypass', true) = 'on');
CREATE POLICY bot_budgets_tenant ON "bot_budgets" USING (
 "spaceId" = NULLIF(current_setting('app.space_id', true), '') AND
 "userId" = NULLIF(current_setting('app.user_id', true), ''));
