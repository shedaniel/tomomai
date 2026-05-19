TRUNCATE TABLE "apikey";
--> statement-breakpoint
ALTER TABLE "apikey" DROP CONSTRAINT "apikey_userId_user_id_fk";
--> statement-breakpoint
DROP INDEX "apikey_userid_idx";--> statement-breakpoint
ALTER TABLE "apikey" ADD COLUMN "referenceId" text NOT NULL;--> statement-breakpoint
ALTER TABLE "apikey" ADD COLUMN "configId" text NOT NULL;--> statement-breakpoint
CREATE INDEX "apikey_referenceid_idx" ON "apikey" USING btree ("referenceId");--> statement-breakpoint
CREATE INDEX "apikey_configid_idx" ON "apikey" USING btree ("configId");--> statement-breakpoint
ALTER TABLE "apikey" DROP COLUMN "userId";