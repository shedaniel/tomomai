ALTER TABLE "score_data" ALTER COLUMN "id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "score_data" ALTER COLUMN "id" SET MAXVALUE 2147483647;--> statement-breakpoint
ALTER TABLE "snapshot_b50" ALTER COLUMN "snapshotId" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "snapshot_b50" ALTER COLUMN "scoreId" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "snapshot_scores" ALTER COLUMN "snapshotId" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "snapshot_scores" ALTER COLUMN "scoreId" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "snapshotId" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "user_scores" ALTER COLUMN "snapshotId" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "user_snapshots" ALTER COLUMN "id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "user_snapshots" ALTER COLUMN "id" SET MAXVALUE 2147483647;