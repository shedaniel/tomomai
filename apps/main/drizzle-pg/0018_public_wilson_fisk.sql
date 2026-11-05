-- Requires the deployment runner's transaction and a coordinated write-maintenance window.
-- Preserve parent/instance IDs; abort unexpected legacy data before retiring it.
-- "user" is locked up front because its region columns are copied and then dropped.
LOCK TABLE "user", parent_song, songs, user_tokens, fetch_sessions, user_snapshots,
  score_data, snapshot_scores, snapshot_b50, user_recent_songs, user_albums, user_events
  IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DROP MATERIALIZED VIEW IF EXISTS "public"."chart_percentile_bands";
--> statement-breakpoint
DROP MATERIALIZED VIEW IF EXISTS "public"."chart_percentile_bands_all_regions";
--> statement-breakpoint
DO $$
BEGIN
  IF enum_range(NULL::chart_type)::text[] <> ARRAY['std','dx']
    OR enum_range(NULL::difficulty)::text[] <> ARRAY['basic','advanced','expert','master','remaster','utage']
    OR enum_range(NULL::fc)::text[] <> ARRAY['none','fc','fc+','ap','ap+']
    OR enum_range(NULL::fs)::text[] <> ARRAY['none','sync','fs','fs+','fdx','fdx+']
    OR enum_range(NULL::title_type)::text[] <> ARRAY['normal','bronze','silver','gold','rainbow'] THEN
    RAISE EXCEPTION 'Unexpected legacy enum mapping; audit before multi-game migration';
  END IF;
  IF EXISTS (SELECT 1 FROM snapshot_b50 WHERE rank < 0 OR rank >= 50) THEN
    RAISE EXCEPTION 'B50 rank outside supported 0..49 range';
  END IF;
END $$;
--> statement-breakpoint
CREATE TYPE "public"."game" AS ENUM('maimai', 'chunithm');--> statement-breakpoint
CREATE TABLE "snapshot_rankings" (
	"snapshotId" integer NOT NULL,
	"game" "game" NOT NULL,
	"bucket" smallint NOT NULL,
	"rank" smallint NOT NULL,
	"scoreId" integer NOT NULL,
	CONSTRAINT "snapshot_rankings_snapshotId_bucket_rank_pk" PRIMARY KEY("snapshotId","bucket","rank")
);
--> statement-breakpoint
CREATE TABLE "user_game_preferences" (
	"userId" text NOT NULL,
	"game" "game" NOT NULL,
	"region" "region",
	"profileMainRegion" "region",
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "user_game_preferences_userId_game_pk" PRIMARY KEY("userId","game")
);
--> statement-breakpoint
ALTER TABLE "score_data" RENAME COLUMN "achievement" TO "scoreValue";--> statement-breakpoint
ALTER TABLE "score_data" RENAME COLUMN "dxScore" TO "secondaryScore";--> statement-breakpoint
ALTER TABLE "score_data" RENAME COLUMN "fc" TO "comboStatus";--> statement-breakpoint
ALTER TABLE "score_data" RENAME COLUMN "fs" TO "syncStatus";--> statement-breakpoint
ALTER TABLE "user_recent_songs" RENAME COLUMN "archievement" TO "scoreValue";--> statement-breakpoint
ALTER TABLE "user_recent_songs" RENAME COLUMN "dxScore" TO "secondaryScore";--> statement-breakpoint
ALTER TABLE "user_recent_songs" RENAME COLUMN "maxDxScore" TO "maxSecondaryScore";--> statement-breakpoint
ALTER TABLE "user_recent_songs" RENAME COLUMN "fc" TO "comboStatus";--> statement-breakpoint
ALTER TABLE "user_recent_songs" RENAME COLUMN "fs" TO "syncStatus";--> statement-breakpoint
ALTER TABLE "parent_song" DROP CONSTRAINT "parent_song_name_type_difficulty_disambiguator_unique";--> statement-breakpoint
ALTER TABLE "score_data" DROP CONSTRAINT "score_data_songid_achievement_dxscore_fc_fs_unique";--> statement-breakpoint
ALTER TABLE "user_recent_songs" DROP CONSTRAINT "user_recent_songs_userid_songid_playedat_unique";--> statement-breakpoint
ALTER TABLE "user_tokens" DROP CONSTRAINT "user_tokens_userId_region_unique";--> statement-breakpoint
ALTER TABLE "score_data" DROP CONSTRAINT "score_data_songId_songs_id_fk";
--> statement-breakpoint
ALTER TABLE "snapshot_scores" DROP CONSTRAINT "snapshot_scores_snapshotId_user_snapshots_id_fk";
--> statement-breakpoint
ALTER TABLE "snapshot_scores" DROP CONSTRAINT "snapshot_scores_scoreId_score_data_id_fk";
--> statement-breakpoint
ALTER TABLE "songs" DROP CONSTRAINT "songs_parentId_parent_song_id_fk";
--> statement-breakpoint
ALTER TABLE "user_albums" DROP CONSTRAINT "user_albums_songId_songs_id_fk";
--> statement-breakpoint
ALTER TABLE "user_events" DROP CONSTRAINT "user_events_snapshotId_user_snapshots_id_fk";
--> statement-breakpoint
ALTER TABLE "user_recent_songs" DROP CONSTRAINT "user_recent_songs_songId_songs_id_fk";
--> statement-breakpoint
DROP INDEX "fetch_sessions_userid_region_startedat_idx";--> statement-breakpoint
DROP INDEX "parent_song_songname_type_idx";--> statement-breakpoint
DROP INDEX "score_data_songid_idx";--> statement-breakpoint
DROP INDEX "songs_region_gameversion_idx";--> statement-breakpoint
DROP INDEX "user_albums_userid_takenat_idx";--> statement-breakpoint
DROP INDEX "user_albums_songid_idx";--> statement-breakpoint
DROP INDEX "user_events_snapshotid_idx";--> statement-breakpoint
DROP INDEX "user_recent_songs_userid_playedat_idx";--> statement-breakpoint
DROP INDEX "user_recent_songs_userid_songid_idx";--> statement-breakpoint
DROP INDEX "user_recent_songs_songid_idx";--> statement-breakpoint
DROP INDEX "user_snapshots_userid_region_idx";--> statement-breakpoint
DROP INDEX "user_snapshots_userid_region_fetchedat_idx";--> statement-breakpoint
-- Codes are the labels' positions in the enum order verified above. An unknown label maps to NULL
-- and aborts on NOT NULL. drizzle-kit omits type and nullability changes on renamed columns, so
-- those clauses are written here. One ALTER per table keeps each large table to a single rewrite.
ALTER TABLE "parent_song"
  ALTER COLUMN "type" TYPE smallint USING (CASE "type" WHEN 'std' THEN 0 WHEN 'dx' THEN 1 END)::smallint,
  ALTER COLUMN "difficulty" TYPE smallint USING (CASE "difficulty" WHEN 'basic' THEN 0 WHEN 'advanced' THEN 1 WHEN 'expert' THEN 2 WHEN 'master' THEN 3 WHEN 'remaster' THEN 4 WHEN 'utage' THEN 5 END)::smallint;
--> statement-breakpoint
ALTER TABLE "songs" ALTER COLUMN "level" TYPE text USING "level"::text;
--> statement-breakpoint
ALTER TABLE "score_data"
  ALTER COLUMN "comboStatus" TYPE smallint USING (CASE "comboStatus" WHEN 'none' THEN 0 WHEN 'fc' THEN 1 WHEN 'fc+' THEN 2 WHEN 'ap' THEN 3 WHEN 'ap+' THEN 4 END)::smallint,
  ALTER COLUMN "syncStatus" TYPE smallint USING (CASE "syncStatus" WHEN 'none' THEN 0 WHEN 'sync' THEN 1 WHEN 'fs' THEN 2 WHEN 'fs+' THEN 3 WHEN 'fdx' THEN 4 WHEN 'fdx+' THEN 5 END)::smallint;
--> statement-breakpoint
ALTER TABLE "user_recent_songs"
  ALTER COLUMN "maxSecondaryScore" DROP NOT NULL,
  ALTER COLUMN "comboStatus" TYPE smallint USING (CASE "comboStatus" WHEN 'none' THEN 0 WHEN 'fc' THEN 1 WHEN 'fc+' THEN 2 WHEN 'ap' THEN 3 WHEN 'ap+' THEN 4 END)::smallint,
  ALTER COLUMN "syncStatus" TYPE smallint USING (CASE "syncStatus" WHEN 'none' THEN 0 WHEN 'sync' THEN 1 WHEN 'fs' THEN 2 WHEN 'fs+' THEN 3 WHEN 'fdx' THEN 4 WHEN 'fdx+' THEN 5 END)::smallint;
--> statement-breakpoint
ALTER TABLE "user_snapshots"
  ALTER COLUMN "courseRankUrl" DROP NOT NULL,
  ALTER COLUMN "classRankUrl" DROP NOT NULL,
  ALTER COLUMN "stars" DROP NOT NULL,
  ALTER COLUMN "titleType" DROP DEFAULT,
  ALTER COLUMN "titleType" TYPE smallint USING (CASE "titleType" WHEN 'normal' THEN 0 WHEN 'bronze' THEN 1 WHEN 'silver' THEN 2 WHEN 'gold' THEN 3 WHEN 'rainbow' THEN 4 END)::smallint,
  ALTER COLUMN "titleType" SET DEFAULT 0;
--> statement-breakpoint
-- Every existing row is maimai. The temporary defaults are removed at the end, so new writes must choose a game.
ALTER TABLE "fetch_sessions" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';--> statement-breakpoint
ALTER TABLE "parent_song" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';--> statement-breakpoint
ALTER TABLE "score_data" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';--> statement-breakpoint
ALTER TABLE "score_data" ADD COLUMN "clearStatus" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "snapshot_scores" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "user_albums" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';--> statement-breakpoint
ALTER TABLE "user_events" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD COLUMN "clearStatus" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_snapshots" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';--> statement-breakpoint
ALTER TABLE "user_tokens" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';--> statement-breakpoint
-- B50 ranks 0-14 are the new-song bucket, 15-49 the old-song bucket, with ranks relative to each bucket.
INSERT INTO snapshot_rankings ("snapshotId", game, bucket, rank, "scoreId")
SELECT "snapshotId", 'maimai', CASE WHEN rank < 15 THEN 1 ELSE 2 END,
  CASE WHEN rank < 15 THEN rank ELSE rank - 15 END, "scoreId"
FROM snapshot_b50;
--> statement-breakpoint
ALTER TABLE "parent_song" ADD CONSTRAINT "parent_song_id_game_unique" UNIQUE("id","game");--> statement-breakpoint
ALTER TABLE "parent_song" ADD CONSTRAINT "parent_song_game_name_type_difficulty_disambiguator_unique" UNIQUE("game","songName","type","difficulty","disambiguator");--> statement-breakpoint
ALTER TABLE "score_data" ADD CONSTRAINT "score_data_id_game_unique" UNIQUE("id","game");--> statement-breakpoint
ALTER TABLE "score_data" ADD CONSTRAINT "score_data_songid_score_combo_sync_clear_unique" UNIQUE("songId","scoreValue","secondaryScore","comboStatus","syncStatus","clearStatus");--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_id_game_unique" UNIQUE("id","game");--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD CONSTRAINT "user_recent_songs_userid_game_songid_playedat_unique" UNIQUE("userId","game","songId","playedAt");--> statement-breakpoint
ALTER TABLE "user_snapshots" ADD CONSTRAINT "user_snapshots_id_game_unique" UNIQUE("id","game");--> statement-breakpoint
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_userid_game_region_unique" UNIQUE("userId","game","region");--> statement-breakpoint
ALTER TABLE "snapshot_rankings" ADD CONSTRAINT "snapshot_rankings_snapshot_game_fk" FOREIGN KEY ("snapshotId","game") REFERENCES "public"."user_snapshots"("id","game") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_rankings" ADD CONSTRAINT "snapshot_rankings_score_game_fk" FOREIGN KEY ("scoreId","game") REFERENCES "public"."score_data"("id","game") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_game_preferences" ADD CONSTRAINT "user_game_preferences_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_data" ADD CONSTRAINT "score_data_song_game_fk" FOREIGN KEY ("songId","game") REFERENCES "public"."songs"("id","game") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_scores" ADD CONSTRAINT "snapshot_scores_snapshot_game_fk" FOREIGN KEY ("snapshotId","game") REFERENCES "public"."user_snapshots"("id","game") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_scores" ADD CONSTRAINT "snapshot_scores_score_game_fk" FOREIGN KEY ("scoreId","game") REFERENCES "public"."score_data"("id","game") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_parent_game_fk" FOREIGN KEY ("parentId","game") REFERENCES "public"."parent_song"("id","game") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_albums" ADD CONSTRAINT "user_albums_song_game_fk" FOREIGN KEY ("songId","game") REFERENCES "public"."songs"("id","game") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_snapshot_game_fk" FOREIGN KEY ("snapshotId","game") REFERENCES "public"."user_snapshots"("id","game") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD CONSTRAINT "user_recent_songs_song_game_fk" FOREIGN KEY ("songId","game") REFERENCES "public"."songs"("id","game") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The account-wide region columns become maimai's per-game preferences, then go.
INSERT INTO "user_game_preferences" ("userId", "game", "region", "profileMainRegion")
SELECT "id", 'maimai'::"game", "region", "profileMainRegion" FROM "user";
--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "region";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "profileMainRegion";--> statement-breakpoint
CREATE INDEX "fetch_sessions_userid_game_region_startedat_idx" ON "fetch_sessions" USING btree ("userId","game","region","startedAt");--> statement-breakpoint
CREATE INDEX "parent_song_game_songname_type_idx" ON "parent_song" USING btree ("game","songName","type");--> statement-breakpoint
CREATE INDEX "songs_game_region_gameversion_idx" ON "songs" USING btree ("game","region","gameVersion");--> statement-breakpoint
CREATE INDEX "user_albums_userid_game_takenat_idx" ON "user_albums" USING btree ("userId","game","takenAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_albums_songid_game_idx" ON "user_albums" USING btree ("songId","game");--> statement-breakpoint
CREATE INDEX "user_events_snapshotid_game_idx" ON "user_events" USING btree ("snapshotId","game");--> statement-breakpoint
CREATE INDEX "user_recent_songs_userid_game_playedat_idx" ON "user_recent_songs" USING btree ("userId","game","playedAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_recent_songs_songid_game_idx" ON "user_recent_songs" USING btree ("songId","game");--> statement-breakpoint
CREATE INDEX "user_snapshots_userid_game_region_fetchedat_idx" ON "user_snapshots" USING btree ("userId","game","region","fetchedAt");--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD CONSTRAINT "user_recent_songs_maimai_fields" CHECK ("user_recent_songs"."game" <> 'maimai' OR "user_recent_songs"."maxSecondaryScore" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "user_snapshots" ADD CONSTRAINT "user_snapshots_maimai_fields" CHECK ("user_snapshots"."game" <> 'maimai' OR ("user_snapshots"."courseRankUrl" IS NOT NULL AND "user_snapshots"."classRankUrl" IS NOT NULL AND "user_snapshots"."stars" IS NOT NULL));--> statement-breakpoint
DROP TABLE "snapshot_b50";--> statement-breakpoint
ALTER TABLE "fetch_sessions" ALTER COLUMN "game" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "parent_song" ALTER COLUMN "game" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "score_data" ALTER COLUMN "game" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "snapshot_scores" ALTER COLUMN "game" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "songs" ALTER COLUMN "game" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_albums" ALTER COLUMN "game" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "game" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_recent_songs" ALTER COLUMN "game" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_snapshots" ALTER COLUMN "game" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_tokens" ALTER COLUMN "game" DROP DEFAULT;--> statement-breakpoint
DROP TYPE "public"."chart_type";--> statement-breakpoint
DROP TYPE "public"."difficulty";--> statement-breakpoint
DROP TYPE "public"."fc";--> statement-breakpoint
DROP TYPE "public"."fs";--> statement-breakpoint
DROP TYPE "public"."level";--> statement-breakpoint
DROP TYPE "public"."title_type";
