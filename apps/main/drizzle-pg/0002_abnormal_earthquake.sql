CREATE TABLE "user_recent_songs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_recent_songs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"userId" text NOT NULL,
	"songId" bigint NOT NULL,
	"playedAt" timestamp (0) NOT NULL,
	"archievement" integer NOT NULL,
	"dxScore" smallint NOT NULL,
	"maxDxScore" smallint NOT NULL,
	"fc" "fc" NOT NULL,
	"fs" "fs" NOT NULL,
	"track" smallint NOT NULL,
	CONSTRAINT "user_recent_songs_userid_songid_playedat_unique" UNIQUE("userId","songId","playedAt")
);
--> statement-breakpoint
CREATE TABLE "user_recent_songs_detailed" (
	"recentSongId" bigint PRIMARY KEY NOT NULL,
	"fastCount" smallint NOT NULL,
	"lateCount" smallint NOT NULL,
	"combo" smallint NOT NULL,
	"maxCombo" smallint NOT NULL,
	"syncScore" smallint,
	"maxSyncScore" smallint,
	"tapCPerfect" smallint NOT NULL,
	"tapPerfect" smallint NOT NULL,
	"tapGreat" smallint NOT NULL,
	"tapGood" smallint NOT NULL,
	"tapMiss" smallint NOT NULL,
	"holdCPerfect" smallint NOT NULL,
	"holdPerfect" smallint NOT NULL,
	"holdGreat" smallint NOT NULL,
	"holdGood" smallint NOT NULL,
	"holdMiss" smallint NOT NULL,
	"slideCPerfect" smallint NOT NULL,
	"slidePerfect" smallint NOT NULL,
	"slideGreat" smallint NOT NULL,
	"slideGood" smallint NOT NULL,
	"slideMiss" smallint NOT NULL,
	"touchCPerfect" smallint NOT NULL,
	"touchPerfect" smallint NOT NULL,
	"touchGreat" smallint NOT NULL,
	"touchGood" smallint NOT NULL,
	"touchMiss" smallint NOT NULL,
	"breakCPerfect" smallint NOT NULL,
	"breakPerfect" smallint NOT NULL,
	"breakGreat" smallint NOT NULL,
	"breakGood" smallint NOT NULL,
	"breakMiss" smallint NOT NULL,
	"venue" text,
	"rating" smallint NOT NULL,
	"ratingChange" smallint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD CONSTRAINT "user_recent_songs_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD CONSTRAINT "user_recent_songs_songId_songs_id_fk" FOREIGN KEY ("songId") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recent_songs_detailed" ADD CONSTRAINT "user_recent_songs_detailed_recentSongId_user_recent_songs_id_fk" FOREIGN KEY ("recentSongId") REFERENCES "public"."user_recent_songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_recent_songs_userid_playedat_idx" ON "user_recent_songs" USING btree ("userId","playedAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_recent_songs_userid_songid_idx" ON "user_recent_songs" USING btree ("userId","songId");--> statement-breakpoint
CREATE INDEX "user_recent_songs_songid_idx" ON "user_recent_songs" USING btree ("songId");