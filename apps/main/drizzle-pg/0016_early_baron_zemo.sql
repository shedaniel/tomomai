CREATE TYPE "public"."profile_report_reason" AS ENUM('harassment', 'hate', 'sexual', 'violence', 'spam', 'impersonation', 'other');--> statement-breakpoint
CREATE TYPE "public"."profile_report_status" AS ENUM('pending', 'dismissed', 'removed');--> statement-breakpoint
CREATE TABLE "profile_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporterUserId" text NOT NULL,
	"targetUserId" text NOT NULL,
	"reason" "profile_report_reason" NOT NULL,
	"details" varchar(1000),
	"descriptionSnapshot" text NOT NULL,
	"status" "profile_report_status" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"resolvedAt" timestamp (0),
	"resolutionNote" varchar(1000)
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profileDescription" text;--> statement-breakpoint
ALTER TABLE "profile_reports" ADD CONSTRAINT "profile_reports_reporterUserId_user_id_fk" FOREIGN KEY ("reporterUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_reports" ADD CONSTRAINT "profile_reports_targetUserId_user_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_reports_status_createdat_idx" ON "profile_reports" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "profile_reports_targetuserid_idx" ON "profile_reports" USING btree ("targetUserId");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_reports_pending_reporter_target_idx" ON "profile_reports" USING btree ("reporterUserId","targetUserId") WHERE "profile_reports"."status" = 'pending';