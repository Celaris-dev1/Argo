-- New approval preferences default to Never ask.
ALTER TABLE "action_auto_review_preferences" ALTER COLUMN "skipApprovals" SET DEFAULT true;
ALTER TABLE "user_action_auto_review_preferences" ALTER COLUMN "skipApprovals" SET DEFAULT true;
