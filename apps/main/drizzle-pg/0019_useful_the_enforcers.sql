ALTER TABLE "user_recent_songs" ADD COLUMN "parentId" bigint;--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD COLUMN "region" "region";--> statement-breakpoint
UPDATE "user_recent_songs" AS r
SET "parentId" = s."parentId", "region" = s."region"
FROM "songs" AS s
WHERE s."id" = r."songId";--> statement-breakpoint
-- A play fetched on both sides of a version cutoff was stored once per version. Keep the oldest version's row, which is the version it was played in.
CREATE TEMP TABLE "recent_play_duplicates" AS
SELECT "id", "keeperId"
FROM (
  SELECT r."id", first_value(r."id") OVER (
    PARTITION BY r."userId", r."game", r."parentId", r."region", r."playedAt"
    ORDER BY s."gameVersion", r."id"
  ) AS "keeperId"
  FROM "user_recent_songs" AS r
  JOIN "songs" AS s ON s."id" = r."songId"
) AS ranked
WHERE "id" <> "keeperId";--> statement-breakpoint
-- Each kept play takes its group's best maimai breakdown: a complete one first, then its own.
CREATE TEMP TABLE "recent_play_best_details" AS
SELECT DISTINCT ON (g."keeperId") g."keeperId", d."recentSongId"
FROM (
  SELECT "id", "keeperId" FROM "recent_play_duplicates"
  UNION
  SELECT "keeperId", "keeperId" FROM "recent_play_duplicates"
) AS g
JOIN "user_recent_songs_detailed" AS d ON d."recentSongId" = g."id"
ORDER BY g."keeperId", (d."maxCombo" > 0) DESC, (d."recentSongId" = g."keeperId") DESC, d."recentSongId";--> statement-breakpoint
DELETE FROM "user_recent_songs_detailed" AS d
USING "recent_play_best_details" AS b
WHERE d."recentSongId" = b."keeperId" AND b."recentSongId" <> b."keeperId";--> statement-breakpoint
UPDATE "user_recent_songs_detailed" AS d
SET "recentSongId" = b."keeperId"
FROM "recent_play_best_details" AS b
WHERE d."recentSongId" = b."recentSongId" AND b."recentSongId" <> b."keeperId";--> statement-breakpoint
UPDATE "user_recent_songs" AS k
SET "metadata" = m."metadata"
FROM (
  SELECT DISTINCT ON (dup."keeperId") dup."keeperId", r."metadata"
  FROM "recent_play_duplicates" AS dup
  JOIN "user_recent_songs" AS r ON r."id" = dup."id"
  WHERE r."metadata" IS NOT NULL
  ORDER BY dup."keeperId", r."id"
) AS m
WHERE k."id" = m."keeperId" AND k."metadata" IS NULL;--> statement-breakpoint
DELETE FROM "user_recent_songs" AS r
USING "recent_play_duplicates" AS dup
WHERE r."id" = dup."id";--> statement-breakpoint
DROP TABLE "recent_play_best_details";--> statement-breakpoint
DROP TABLE "recent_play_duplicates";--> statement-breakpoint
ALTER TABLE "user_recent_songs" ALTER COLUMN "parentId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_recent_songs" ALTER COLUMN "region" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_recent_songs" DROP CONSTRAINT "user_recent_songs_userid_game_songid_playedat_unique";--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD CONSTRAINT "user_recent_songs_parent_game_fk" FOREIGN KEY ("parentId","game") REFERENCES "public"."parent_song"("id","game") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recent_songs" ADD CONSTRAINT "user_recent_songs_userid_game_parentid_region_playedat_unique" UNIQUE("userId","game","parentId","region","playedAt");
