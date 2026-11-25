-- Additive: older releases never read this column.
ALTER TABLE "bot_status_pages" ADD COLUMN "allowCopy" BOOLEAN NOT NULL DEFAULT false;
