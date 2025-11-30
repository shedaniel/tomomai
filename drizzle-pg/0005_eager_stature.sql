ALTER TABLE "songs" ADD COLUMN "bpm" smallint;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "noteDesigner" text;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "tapCount" smallint;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "holdCount" smallint;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "slideCount" smallint;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "touchCount" smallint;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "breakCount" smallint;--> statement-breakpoint
CREATE INDEX "invites_createdby_idx" ON "invites" USING btree ("createdBy");--> statement-breakpoint
CREATE INDEX "songs_songname_type_idx" ON "songs" USING btree ("songName","type");--> statement-breakpoint
CREATE INDEX "store_edits_storeid_userid_idx" ON "store_edits" USING btree ("storeId","userId");