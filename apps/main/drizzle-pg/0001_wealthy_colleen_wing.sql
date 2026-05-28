ALTER TABLE "fetch_sessions" ALTER COLUMN "startedAt" SET DATA TYPE timestamp (0);--> statement-breakpoint
ALTER TABLE "fetch_sessions" ALTER COLUMN "completedAt" SET DATA TYPE timestamp (0);--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "claimedAt" SET DATA TYPE timestamp (0);--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp (0);--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "eventPeriodStart" SET DATA TYPE timestamp (0);--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "eventPeriodEnd" SET DATA TYPE timestamp (0);--> statement-breakpoint
ALTER TABLE "user_snapshots" ALTER COLUMN "fetchedAt" SET DATA TYPE timestamp (0);