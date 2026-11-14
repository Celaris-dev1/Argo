-- Additive: older releases never read or write this table.
CREATE TABLE "run_shares" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "botName" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "run_shares_runId_key" ON "run_shares"("runId");
CREATE INDEX "run_shares_spaceId_userId_idx" ON "run_shares"("spaceId", "userId");

ALTER TABLE "run_shares" ADD CONSTRAINT "run_shares_runId_fkey" FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "run_shares" ADD CONSTRAINT "run_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "run_shares" ENABLE ROW LEVEL SECURITY;
CREATE POLICY run_shares_system ON "run_shares" USING (current_setting('app.rls_bypass', true) = 'on');
CREATE POLICY run_shares_tenant ON "run_shares" USING (
 "spaceId" = NULLIF(current_setting('app.space_id', true), '') AND
 "userId" = NULLIF(current_setting('app.user_id', true), ''));
