ALTER TABLE "user_albums" DROP CONSTRAINT "user_albums_songId_songs_id_fk";
--> statement-breakpoint
ALTER TABLE "user_albums" ADD CONSTRAINT "user_albums_songId_songs_id_fk" FOREIGN KEY ("songId") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;