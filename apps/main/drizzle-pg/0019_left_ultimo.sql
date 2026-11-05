CREATE TYPE "public"."profile_audience" AS ENUM('private', 'friends', 'public');--> statement-breakpoint
CREATE TABLE "friend_hides" (
	"userId" text NOT NULL,
	"hiddenUserId" text NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "friend_hides_userId_hiddenUserId_pk" PRIMARY KEY("userId","hiddenUserId")
);
--> statement-breakpoint
CREATE TABLE "player_friends" (
	"identityId" bigint NOT NULL,
	"codeHash" varchar(64) NOT NULL,
	CONSTRAINT "player_friends_identityId_codeHash_pk" PRIMARY KEY("identityId","codeHash")
);
--> statement-breakpoint
CREATE TABLE "player_identities" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "player_identities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"userId" text NOT NULL,
	"game" "game" NOT NULL,
	"region" "region" NOT NULL,
	"codeHash" varchar(64) NOT NULL,
	"friendsSyncedAt" timestamp (0),
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "player_identities_userid_game_region_unique" UNIQUE("userId","game","region"),
	CONSTRAINT "player_identities_game_region_codehash_unique" UNIQUE("game","region","codeHash")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profileVisibility" "profile_audience" DEFAULT 'friends' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profileAllScoresAudience" "profile_audience" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profileScoreDetailsAudience" "profile_audience" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profilePlatesAudience" "profile_audience" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profilePlayCountsAudience" "profile_audience" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profileEventsAudience" "profile_audience" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "friendsEnabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "friend_hides" ADD CONSTRAINT "friend_hides_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_hides" ADD CONSTRAINT "friend_hides_hiddenUserId_user_id_fk" FOREIGN KEY ("hiddenUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_friends" ADD CONSTRAINT "player_friends_identityId_player_identities_id_fk" FOREIGN KEY ("identityId") REFERENCES "public"."player_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_identities" ADD CONSTRAINT "player_identities_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friend_hides_hiddenuserid_idx" ON "friend_hides" USING btree ("hiddenUserId");--> statement-breakpoint
CREATE INDEX "player_friends_codehash_idx" ON "player_friends" USING btree ("codeHash");--> statement-breakpoint
-- Carry the retired switches over before dropping them: a profile that was not published becomes friends-only,
-- and a part that was hidden stays hidden from everyone.
UPDATE "user" SET
	"profileVisibility" = (CASE WHEN "publishProfile" THEN 'public' ELSE 'friends' END)::"profile_audience",
	"profileAllScoresAudience" = (CASE WHEN "profileShowAllScores" THEN 'public' ELSE 'private' END)::"profile_audience",
	"profileScoreDetailsAudience" = (CASE WHEN "profileShowScoreDetails" THEN 'public' ELSE 'private' END)::"profile_audience",
	"profilePlatesAudience" = (CASE WHEN "profileShowPlates" THEN 'public' ELSE 'private' END)::"profile_audience",
	"profilePlayCountsAudience" = (CASE WHEN "profileShowPlayCounts" THEN 'public' ELSE 'private' END)::"profile_audience",
	"profileEventsAudience" = (CASE WHEN "profileShowEvents" THEN 'public' ELSE 'private' END)::"profile_audience";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "publishProfile";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "profileShowAllScores";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "profileShowScoreDetails";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "profileShowPlates";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "profileShowPlayCounts";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "profileShowEvents";