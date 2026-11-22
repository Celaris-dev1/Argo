-- Additive: older releases never read or write this table.
CREATE TABLE "published_sites" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "published_sites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "published_sites_botId_source_key" ON "published_sites"("botId", "source");
CREATE INDEX "published_sites_spaceId_userId_idx" ON "published_sites"("spaceId", "userId");

ALTER TABLE "published_sites" ADD CONSTRAINT "published_sites_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "published_sites" ENABLE ROW LEVEL SECURITY;
CREATE POLICY published_sites_system ON "published_sites" USING (current_setting('app.rls_bypass', true) = 'on');
CREATE POLICY published_sites_tenant ON "published_sites" USING (
 "spaceId" = NULLIF(current_setting('app.space_id', true), '') AND
 "userId" = NULLIF(current_setting('app.user_id', true), ''));
