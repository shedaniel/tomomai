CREATE TYPE "public"."legal_doc_type" AS ENUM('tos', 'privacy');--> statement-breakpoint
CREATE TABLE "policyAcceptance" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "policyAcceptance_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" text NOT NULL,
	"docType" "legal_doc_type" NOT NULL,
	"version" text NOT NULL,
	"acceptedAt" timestamp (0) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policyAcceptance" ADD CONSTRAINT "policyAcceptance_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_acceptance_userid_idx" ON "policyAcceptance" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "policy_acceptance_user_doc_idx" ON "policyAcceptance" USING btree ("userId","docType");--> statement-breakpoint
-- Backfill: existing users implicitly accepted the 2026-02-20 policy at signup.
-- Record audit rows (timestamped at signup) so they get a soft re-consent prompt
-- for the newer revision instead of a hard lockout (no rows = below every floor).
-- Runs once; users created after this migration are seeded by the auth hook.
INSERT INTO "policyAcceptance" ("userId", "docType", "version", "acceptedAt")
SELECT "id", 'tos', '20260220', "createdAt" FROM "user";--> statement-breakpoint
INSERT INTO "policyAcceptance" ("userId", "docType", "version", "acceptedAt")
SELECT "id", 'privacy', '20260220', "createdAt" FROM "user";
