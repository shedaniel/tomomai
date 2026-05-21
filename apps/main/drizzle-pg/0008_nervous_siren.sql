CREATE TABLE "user_albums" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_albums_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"userId" text NOT NULL,
	"songId" bigint NOT NULL,
	"takenAt" timestamp (0) NOT NULL,
	"venue" text,
	"imageKey" text NOT NULL,
	"imageSize" integer NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_albums" ADD CONSTRAINT "user_albums_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_albums" ADD CONSTRAINT "user_albums_songId_songs_id_fk" FOREIGN KEY ("songId") REFERENCES "public"."songs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_albums_userid_takenat_idx" ON "user_albums" USING btree ("userId","takenAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_albums_songid_idx" ON "user_albums" USING btree ("songId");