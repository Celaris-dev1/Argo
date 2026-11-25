-- Additive: older releases never read or write this table.
CREATE TABLE "bot_inboxes" (
    "botId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_inboxes_pkey" PRIMARY KEY ("botId")
);

CREATE UNIQUE INDEX "bot_inboxes_address_key" ON "bot_inboxes"("address");
CREATE INDEX "bot_inboxes_spaceId_userId_idx" ON "bot_inboxes"("spaceId", "userId");

ALTER TABLE "bot_inboxes" ADD CONSTRAINT "bot_inboxes_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bot_inboxes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY bot_inboxes_system ON "bot_inboxes" USING (current_setting('app.rls_bypass', true) = 'on');
CREATE POLICY bot_inboxes_tenant ON "bot_inboxes" USING (
 "spaceId" = NULLIF(current_setting('app.space_id', true), '') AND
 "userId" = NULLIF(current_setting('app.user_id', true), ''));
