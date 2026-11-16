-- Additive: older releases never read or write this table.
CREATE TABLE "bot_status_pages" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_status_pages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bot_status_pages_botId_key" ON "bot_status_pages"("botId");
CREATE INDEX "bot_status_pages_spaceId_userId_idx" ON "bot_status_pages"("spaceId", "userId");

ALTER TABLE "bot_status_pages" ADD CONSTRAINT "bot_status_pages_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bot_status_pages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY bot_status_pages_system ON "bot_status_pages" USING (current_setting('app.rls_bypass', true) = 'on');
CREATE POLICY bot_status_pages_tenant ON "bot_status_pages" USING (
 "spaceId" = NULLIF(current_setting('app.space_id', true), '') AND
 "userId" = NULLIF(current_setting('app.user_id', true), ''));
