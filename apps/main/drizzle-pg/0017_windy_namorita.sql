LOCK TABLE "songs" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE "parent_song" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "parent_song_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"publicId" varchar(8) NOT NULL,
	"songName" text NOT NULL,
	"artist" text NOT NULL,
	"genre" text NOT NULL,
	"cover" text NOT NULL,
	"bpm" smallint,
	"type" chart_type NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"disambiguator" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "parent_song_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "parent_song_name_type_difficulty_disambiguator_unique" UNIQUE("songName","type","difficulty","disambiguator")
);
--> statement-breakpoint
ALTER TABLE "songs" DROP CONSTRAINT "songs_publicId_unique";--> statement-breakpoint
ALTER TABLE "songs" DROP CONSTRAINT "song_name_difficulty_type_region_version_addedversion_unique";--> statement-breakpoint
DROP INDEX "songs_publicid_idx";--> statement-breakpoint
DROP INDEX "songs_songname_difficulty_idx";--> statement-breakpoint
DROP INDEX "songs_songname_type_idx";--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "parentId" bigint;--> statement-breakpoint
CREATE INDEX "parent_song_songname_type_idx" ON "parent_song" USING btree ("songName","type");--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_parentId_parent_song_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."parent_song"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "songs_parentid_idx" ON "songs" USING btree ("parentId");--> statement-breakpoint
-- Preserve child IDs while assigning canonical charts before enforcing parentId.
CREATE TEMP TABLE song_clusters AS
WITH colliding AS (
	SELECT DISTINCT "songName", "type", "difficulty"
	FROM songs
	GROUP BY "songName", "type", "difficulty", "region", "gameVersion"
	HAVING COUNT(*) > 1
)
SELECT
	s."id" AS song_id,
	s."songName",
	s."type",
	s."difficulty",
	CASE WHEN c."songName" IS NOT NULL
		THEN DENSE_RANK() OVER (PARTITION BY s."songName", s."type", s."difficulty" ORDER BY s."artist") - 1
		ELSE 0
	END AS disambiguator
FROM songs s
LEFT JOIN colliding c
	ON c."songName" = s."songName" AND c."type" = s."type" AND c."difficulty" = s."difficulty";
--> statement-breakpoint

INSERT INTO parent_song ("publicId", "songName", "artist", "genre", "cover", "bpm", "type", "difficulty", "disambiguator")
SELECT
	substr(translate(encode(decode(md5(random()::text || t."songName" || t."type"::text || t."difficulty"::text || t.disambiguator::text), 'hex'), 'base64'), '+/', '-_'), 1, 8),
	t."songName", t."artist", t."genre", t."cover", t."bpm", t."type", t."difficulty", t.disambiguator
FROM (
	SELECT DISTINCT ON (s."songName", s."type", s."difficulty", sc.disambiguator)
		s."songName", s."artist", s."genre", s."cover", s."bpm", s."type", s."difficulty", sc.disambiguator
	FROM songs s
	JOIN song_clusters sc ON sc.song_id = s."id"
	ORDER BY s."songName", s."type", s."difficulty", sc.disambiguator,
		s."gameVersion" DESC, (s."region" = 'jp') DESC, s."region"
) t;
--> statement-breakpoint

UPDATE songs s
SET "parentId" = p."id"
FROM song_clusters sc
JOIN parent_song p
	ON p."songName" = sc."songName" AND p."type" = sc."type"
	AND p."difficulty" = sc."difficulty" AND p."disambiguator" = sc.disambiguator
WHERE sc.song_id = s."id";
--> statement-breakpoint

DROP TABLE song_clusters;
--> statement-breakpoint

DO $$
DECLARE
	n bigint;
BEGIN
	SELECT COUNT(*) INTO n FROM songs WHERE "parentId" IS NULL;
	IF n > 0 THEN
		RAISE EXCEPTION 'parent_song backfill: % songs rows left without parentId', n;
	END IF;

	SELECT COUNT(*) INTO n FROM (
		SELECT "parentId", "region", "gameVersion"
		FROM songs
		GROUP BY "parentId", "region", "gameVersion"
		HAVING COUNT(*) > 1
	) dup;
	IF n > 0 THEN
		RAISE EXCEPTION 'parent_song backfill: % (parent, region, gameVersion) groups have multiple children', n;
	END IF;

	SELECT COUNT(*) INTO n
	FROM (
		SELECT "songName", "type", "difficulty", COUNT(*) AS n_parents
		FROM parent_song
		GROUP BY "songName", "type", "difficulty"
		HAVING COUNT(*) > 1
	) c
	JOIN (
		SELECT "songName", "type", "difficulty", MAX(cnt) AS max_multiplicity
		FROM (
			SELECT "songName", "type", "difficulty", "region", "gameVersion", COUNT(*) AS cnt
			FROM songs
			GROUP BY "songName", "type", "difficulty", "region", "gameVersion"
		) per_rv
		GROUP BY "songName", "type", "difficulty"
	) m USING ("songName", "type", "difficulty")
	WHERE c.n_parents <> m.max_multiplicity;
	IF n > 0 THEN
		RAISE EXCEPTION 'parent_song backfill: % chart groups split into more parents than their collision multiplicity', n;
	END IF;
END $$;
--> statement-breakpoint

DROP MATERIALIZED VIEW IF EXISTS chart_percentile_bands;
--> statement-breakpoint
ALTER TABLE "songs" ALTER COLUMN "parentId" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "publicId";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "songName";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "artist";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "cover";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "difficulty";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "genre";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "bpm";--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_parent_region_version_unique" UNIQUE("parentId","region","gameVersion");
