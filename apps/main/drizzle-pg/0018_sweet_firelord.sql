-- Requires the deployment runner's transaction and a coordinated write-maintenance window.
-- Preserve parent/instance IDs; abort ambiguous or incomplete backfills before retiring legacy data.
LOCK TABLE parent_song, songs, user_tokens, fetch_sessions, user_snapshots,
  score_data, snapshot_scores, snapshot_b50, user_recent_songs, user_albums, user_events
  IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DROP MATERIALIZED VIEW IF EXISTS chart_percentile_bands_all_regions;
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
  IF EXISTS (SELECT 1 FROM parent_song GROUP BY "songName", type, difficulty, disambiguator HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM user_tokens GROUP BY "userId", region HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM songs GROUP BY "parentId", region, "gameVersion" HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM score_data GROUP BY "songId", achievement, "dxScore", fc, fs HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM user_recent_songs GROUP BY "userId", "songId", "playedAt" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate identity found; migration will not choose winners';
  END IF;
END $$;

--> statement-breakpoint
CREATE TYPE "public"."game" AS ENUM('maimai', 'chunithm');
--> statement-breakpoint
CREATE TABLE "snapshot_rankings" (
	"snapshotId" integer NOT NULL,
	"game" "game" NOT NULL,
	"bucket" smallint NOT NULL,
	"rank" smallint NOT NULL,
	"scoreId" integer NOT NULL,
	CONSTRAINT "snapshot_rankings_snapshotId_bucket_rank_pk" PRIMARY KEY("snapshotId","bucket","rank")
);
--> statement-breakpoint
ALTER TABLE "score_data" RENAME COLUMN "achievement" TO "scoreValue";
--> statement-breakpoint
ALTER TABLE "score_data" RENAME COLUMN "dxScore" TO "secondaryScore";
--> statement-breakpoint
ALTER TABLE "score_data" RENAME COLUMN "fc" TO "comboStatus";
--> statement-breakpoint
ALTER TABLE "score_data" RENAME COLUMN "fs" TO "syncStatus";
--> statement-breakpoint
ALTER TABLE "user_recent_songs" RENAME COLUMN "archievement" TO "scoreValue";
--> statement-breakpoint
ALTER TABLE "user_recent_songs" RENAME COLUMN "dxScore" TO "secondaryScore";
--> statement-breakpoint
ALTER TABLE "user_recent_songs" RENAME COLUMN "fc" TO "comboStatus";
--> statement-breakpoint
ALTER TABLE "user_recent_songs" RENAME COLUMN "fs" TO "syncStatus";
--> statement-breakpoint
ALTER TABLE "parent_song" DROP CONSTRAINT "parent_song_name_type_difficulty_disambiguator_unique";
--> statement-breakpoint
ALTER TABLE "score_data" DROP CONSTRAINT "score_data_songid_achievement_dxscore_fc_fs_unique";
--> statement-breakpoint
ALTER TABLE "user_recent_songs" DROP CONSTRAINT "user_recent_songs_userid_songid_playedat_unique";
--> statement-breakpoint
ALTER TABLE "user_tokens" DROP CONSTRAINT "user_tokens_userId_region_unique";
--> statement-breakpoint
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
DROP INDEX "fetch_sessions_userid_region_startedat_idx";
--> statement-breakpoint
DROP INDEX "parent_song_songname_type_idx";
--> statement-breakpoint
DROP INDEX "score_data_songid_idx";
--> statement-breakpoint
DROP INDEX "songs_region_gameversion_idx";
--> statement-breakpoint
DROP INDEX "user_albums_userid_takenat_idx";
--> statement-breakpoint
DROP INDEX "user_albums_songid_idx";
--> statement-breakpoint
DROP INDEX "user_events_snapshotid_idx";
--> statement-breakpoint
DROP INDEX "user_recent_songs_userid_playedat_idx";
--> statement-breakpoint
DROP INDEX "user_recent_songs_userid_songid_idx";
--> statement-breakpoint
DROP INDEX "user_recent_songs_songid_idx";
--> statement-breakpoint
DROP INDEX "user_snapshots_userid_region_idx";
--> statement-breakpoint
DROP INDEX "user_snapshots_userid_region_fetchedat_idx";
--> statement-breakpoint
ALTER TABLE "parent_song" ALTER COLUMN "type" TYPE smallint USING (array_position(enum_range(NULL::"chart_type"), "type") - 1)::smallint;
--> statement-breakpoint
ALTER TABLE "parent_song" ALTER COLUMN "difficulty" TYPE smallint USING (array_position(enum_range(NULL::"difficulty"), "difficulty") - 1)::smallint;
--> statement-breakpoint
ALTER TABLE "songs" ALTER COLUMN "level" TYPE text USING "level"::text;
--> statement-breakpoint
ALTER TABLE "user_albums" ALTER COLUMN "imageKey" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_albums" ALTER COLUMN "imageSize" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "eventType" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "currentDistance" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "state" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "imageUrl" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_recent_songs" ALTER COLUMN "maxDxScore" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_recent_songs" ALTER COLUMN "track" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_snapshots" ALTER COLUMN "courseRankUrl" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_snapshots" ALTER COLUMN "classRankUrl" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_snapshots" ALTER COLUMN "stars" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_snapshots" ALTER COLUMN "titleType" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user_snapshots" ALTER COLUMN "titleType" TYPE smallint USING (array_position(enum_range(NULL::"title_type"), "titleType") - 1)::smallint;
--> statement-breakpoint
ALTER TABLE "user_snapshots" ALTER COLUMN "titleType" SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "fetch_sessions" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';
--> statement-breakpoint
ALTER TABLE "parent_song" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';
--> statement-breakpoint
ALTER TABLE "parent_song" ADD COLUMN "metadata" jsonb;
--> statement-breakpoint
ALTER TABLE "score_data" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';
--> statement-breakpoint
ALTER TABLE "score_data" ADD COLUMN "clearStatus" smallint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "snapshot_scores" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';
--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';
--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "metadata" jsonb;
--> statement-breakpoint
ALTER TABLE "user_albums" ADD COLUMN "metadata" jsonb;
--> statement-breakpoint
ALTER TABLE "user_albums" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';
--> statement-breakpoint
ALTER TABLE "user_events" ADD COLUMN "metadata" jsonb;
--> statement-breakpoint
ALTER TABLE "user_events" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';
--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD COLUMN "metadata" jsonb;
--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';
--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD COLUMN "clearStatus" smallint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_snapshots" ADD COLUMN "metadata" jsonb;
--> statement-breakpoint
ALTER TABLE "user_snapshots" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';
--> statement-breakpoint
ALTER TABLE "user_tokens" ADD COLUMN "game" "game" NOT NULL DEFAULT 'maimai';
--> statement-breakpoint
CREATE INDEX "fetch_sessions_userid_game_region_startedat_idx" ON "fetch_sessions" USING btree ("userId","game","region","startedAt");
--> statement-breakpoint
CREATE INDEX "parent_song_game_songname_type_idx" ON "parent_song" USING btree ("game","songName","type");
--> statement-breakpoint
CREATE INDEX "score_data_game_songid_idx" ON "score_data" USING btree ("game","songId");
--> statement-breakpoint
CREATE INDEX "songs_game_region_gameversion_idx" ON "songs" USING btree ("game","region","gameVersion");
--> statement-breakpoint
CREATE INDEX "user_albums_userid_game_takenat_idx" ON "user_albums" USING btree ("userId","game","takenAt" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "user_albums_game_songid_idx" ON "user_albums" USING btree ("game","songId");
--> statement-breakpoint
CREATE INDEX "user_events_game_snapshotid_idx" ON "user_events" USING btree ("game","snapshotId");
--> statement-breakpoint
CREATE INDEX "user_recent_songs_userid_game_playedat_idx" ON "user_recent_songs" USING btree ("userId","game","playedAt" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "user_recent_songs_userid_game_songid_idx" ON "user_recent_songs" USING btree ("userId","game","songId");
--> statement-breakpoint
CREATE INDEX "user_recent_songs_game_songid_idx" ON "user_recent_songs" USING btree ("game","songId");
--> statement-breakpoint
CREATE INDEX "user_snapshots_userid_game_region_idx" ON "user_snapshots" USING btree ("userId","game","region");
--> statement-breakpoint
CREATE INDEX "user_snapshots_userid_game_region_fetchedat_idx" ON "user_snapshots" USING btree ("userId","game","region","fetchedAt");
--> statement-breakpoint
ALTER TABLE "score_data" ALTER COLUMN "comboStatus" TYPE smallint USING (array_position(enum_range(NULL::"fc"), "comboStatus") - 1)::smallint;
--> statement-breakpoint
ALTER TABLE "score_data" ALTER COLUMN "syncStatus" TYPE smallint USING (array_position(enum_range(NULL::"fs"), "syncStatus") - 1)::smallint;
--> statement-breakpoint
ALTER TABLE "user_recent_songs" ALTER COLUMN "comboStatus" TYPE smallint USING (array_position(enum_range(NULL::"fc"), "comboStatus") - 1)::smallint;
--> statement-breakpoint
ALTER TABLE "user_recent_songs" ALTER COLUMN "syncStatus" TYPE smallint USING (array_position(enum_range(NULL::"fs"), "syncStatus") - 1)::smallint;
--> statement-breakpoint
INSERT INTO snapshot_rankings ("snapshotId", game, bucket, rank, "scoreId")
SELECT "snapshotId", 'maimai', CASE WHEN rank < 15 THEN 1 ELSE 2 END,
  CASE WHEN rank < 15 THEN rank ELSE rank - 15 END, "scoreId"
FROM snapshot_b50;
--> statement-breakpoint
DO $$
BEGIN
  IF (SELECT count(*) FROM snapshot_rankings) <> (SELECT count(*) FROM snapshot_b50)
    OR EXISTS (
      SELECT 1 FROM snapshot_b50 b
      LEFT JOIN snapshot_rankings r ON r."snapshotId" = b."snapshotId"
        AND r.bucket = CASE WHEN b.rank < 15 THEN 1 ELSE 2 END
        AND r.rank = CASE WHEN b.rank < 15 THEN b.rank ELSE b.rank - 15 END
        AND r."scoreId" = b."scoreId" AND r.game = 'maimai'
      WHERE r."snapshotId" IS NULL
    ) THEN
    RAISE EXCEPTION 'B50 ranking backfill count or mapping mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM songs s JOIN parent_song p ON p.id = s."parentId" WHERE s.game <> p.game)
    OR EXISTS (SELECT 1 FROM score_data d JOIN songs s ON s.id = d."songId" WHERE d.game <> s.game)
    OR EXISTS (SELECT 1 FROM snapshot_scores l JOIN user_snapshots u ON u.id = l."snapshotId" JOIN score_data d ON d.id = l."scoreId" WHERE l.game <> u.game OR l.game <> d.game)
    OR EXISTS (SELECT 1 FROM snapshot_rankings l JOIN user_snapshots u ON u.id = l."snapshotId" JOIN score_data d ON d.id = l."scoreId" WHERE l.game <> u.game OR l.game <> d.game) THEN
    RAISE EXCEPTION 'Cross-game relationship found in migration backfill';
  END IF;
END $$;

--> statement-breakpoint
ALTER TABLE "parent_song" ADD CONSTRAINT "parent_song_id_game_unique" UNIQUE("id","game");
--> statement-breakpoint
ALTER TABLE "parent_song" ADD CONSTRAINT "parent_song_game_name_type_difficulty_disambiguator_unique" UNIQUE("game","songName","type","difficulty","disambiguator");
--> statement-breakpoint
ALTER TABLE "score_data" ADD CONSTRAINT "score_data_id_game_unique" UNIQUE("id","game");
--> statement-breakpoint
ALTER TABLE "score_data" ADD CONSTRAINT "score_data_songid_score_combo_sync_clear_unique" UNIQUE("songId","scoreValue","secondaryScore","comboStatus","syncStatus","clearStatus");
--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_id_game_unique" UNIQUE("id","game");
--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD CONSTRAINT "user_recent_songs_userid_game_songid_playedat_unique" UNIQUE("userId","game","songId","playedAt");
--> statement-breakpoint
ALTER TABLE "user_snapshots" ADD CONSTRAINT "user_snapshots_id_game_unique" UNIQUE("id","game");
--> statement-breakpoint
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_userid_game_region_unique" UNIQUE("userId","game","region");
--> statement-breakpoint
ALTER TABLE "snapshot_rankings" ADD CONSTRAINT "snapshot_rankings_snapshot_game_fk" FOREIGN KEY ("snapshotId","game") REFERENCES "public"."user_snapshots"("id","game") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "snapshot_rankings" ADD CONSTRAINT "snapshot_rankings_score_game_fk" FOREIGN KEY ("scoreId","game") REFERENCES "public"."score_data"("id","game") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "score_data" ADD CONSTRAINT "score_data_song_game_fk" FOREIGN KEY ("songId","game") REFERENCES "public"."songs"("id","game") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "snapshot_scores" ADD CONSTRAINT "snapshot_scores_snapshot_game_fk" FOREIGN KEY ("snapshotId","game") REFERENCES "public"."user_snapshots"("id","game") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "snapshot_scores" ADD CONSTRAINT "snapshot_scores_score_game_fk" FOREIGN KEY ("scoreId","game") REFERENCES "public"."score_data"("id","game") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_parent_game_fk" FOREIGN KEY ("parentId","game") REFERENCES "public"."parent_song"("id","game") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_albums" ADD CONSTRAINT "user_albums_song_game_fk" FOREIGN KEY ("songId","game") REFERENCES "public"."songs"("id","game") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_snapshot_game_fk" FOREIGN KEY ("snapshotId","game") REFERENCES "public"."user_snapshots"("id","game") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD CONSTRAINT "user_recent_songs_song_game_fk" FOREIGN KEY ("songId","game") REFERENCES "public"."songs"("id","game") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
DO $$
DECLARE table_name text; invalid boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['parent_song','songs','user_tokens','fetch_sessions','user_snapshots','score_data','snapshot_scores','snapshot_rankings','user_recent_songs','user_albums','user_events'] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE game IS NULL OR game <> %L)', table_name, 'maimai') INTO invalid;
    IF invalid THEN RAISE EXCEPTION 'Incomplete maimai game backfill in %', table_name; END IF;
  END LOOP;
END $$;

--> statement-breakpoint
DROP TABLE "snapshot_b50";
--> statement-breakpoint
ALTER TABLE "fetch_sessions" ALTER COLUMN "game" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "parent_song" ALTER COLUMN "game" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "score_data" ALTER COLUMN "game" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "snapshot_scores" ALTER COLUMN "game" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "songs" ALTER COLUMN "game" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user_albums" ALTER COLUMN "game" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "game" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user_recent_songs" ALTER COLUMN "game" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user_snapshots" ALTER COLUMN "game" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user_tokens" ALTER COLUMN "game" DROP DEFAULT;
--> statement-breakpoint
DROP TYPE "public"."chart_type";
--> statement-breakpoint
DROP TYPE "public"."difficulty";
--> statement-breakpoint
DROP TYPE "public"."fc";
--> statement-breakpoint
DROP TYPE "public"."fs";
--> statement-breakpoint
DROP TYPE "public"."level";
--> statement-breakpoint
DROP TYPE "public"."title_type";
