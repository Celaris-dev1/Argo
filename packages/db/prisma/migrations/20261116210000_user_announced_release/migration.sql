-- Additive: older releases never read or write this column.
ALTER TABLE "user" ADD COLUMN "announcedRelease" TEXT;
