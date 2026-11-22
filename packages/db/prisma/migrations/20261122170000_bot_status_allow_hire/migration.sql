-- Additive: older releases never read this column.
ALTER TABLE "bot_status_pages" ADD COLUMN "allowHire" BOOLEAN NOT NULL DEFAULT false;
