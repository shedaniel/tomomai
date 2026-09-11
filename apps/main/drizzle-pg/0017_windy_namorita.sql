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
-- Seed collisions from one complete slice so artist renames cannot create extra parents.
CREATE TEMP TABLE song_clusters AS
SELECT "id" AS song_id, "songName", "type", "difficulty", "artist", "region", "gameVersion",
	NULL::bigint AS disambiguator
FROM songs;
--> statement-breakpoint
CREATE INDEX ON song_clusters ("songName", "type", "difficulty");
--> statement-breakpoint
WITH noncolliding AS (
	SELECT "songName", "type", "difficulty" FROM song_clusters
	GROUP BY "songName", "type", "difficulty"
	HAVING COUNT(*) = COUNT(DISTINCT ("region", "gameVersion"))
)
UPDATE song_clusters sc SET disambiguator = 0 FROM noncolliding n
WHERE sc."songName" = n."songName" AND sc."type" = n."type" AND sc."difficulty" = n."difficulty";
--> statement-breakpoint
CREATE TEMP TABLE song_cluster_candidates (song_id bigint, disambiguator bigint);
--> statement-breakpoint
DO $$
DECLARE
	chart_group record;
	slice record;
	parent_count bigint;
	unmatched_count bigint;
	available_count bigint;
	remaining_parent bigint;
BEGIN
	FOR chart_group IN
		SELECT "songName", "type", "difficulty"
		FROM song_clusters WHERE disambiguator IS NULL
		GROUP BY "songName", "type", "difficulty"
	LOOP
		SELECT MAX(n) INTO parent_count FROM (
			SELECT COUNT(*) AS n FROM song_clusters
			WHERE "songName" = chart_group."songName" AND "type" = chart_group."type"
				AND "difficulty" = chart_group."difficulty"
			GROUP BY "region", "gameVersion"
		) counts;


		FOR slice IN
			SELECT "region", "gameVersion", COUNT(*) AS n FROM song_clusters
			WHERE "songName" = chart_group."songName" AND "type" = chart_group."type"
				AND "difficulty" = chart_group."difficulty"
			GROUP BY "region", "gameVersion"
			ORDER BY COUNT(*) DESC, "gameVersion" DESC, ("region" = 'jp') DESC, "region"
		LOOP
			IF NOT EXISTS (
				SELECT 1 FROM song_clusters
				WHERE "songName" = chart_group."songName" AND "type" = chart_group."type"
					AND "difficulty" = chart_group."difficulty" AND disambiguator IS NOT NULL
			) THEN
				WITH seeds AS (
					SELECT song_id, ROW_NUMBER() OVER (ORDER BY "artist", song_id) - 1 AS slot
					FROM song_clusters
					WHERE "songName" = chart_group."songName" AND "type" = chart_group."type"
						AND "difficulty" = chart_group."difficulty"
						AND "region" = slice."region" AND "gameVersion" = slice."gameVersion"
				)
				UPDATE song_clusters sc SET disambiguator = seeds.slot FROM seeds WHERE sc.song_id = seeds.song_id;
				CONTINUE;
			END IF;

			TRUNCATE song_cluster_candidates;
			INSERT INTO song_cluster_candidates
			SELECT DISTINCT incoming.song_id, known.disambiguator
			FROM song_clusters incoming
			JOIN song_clusters known ON known."songName" = incoming."songName"
				AND known."type" = incoming."type" AND known."difficulty" = incoming."difficulty"
				AND known."artist" = incoming."artist" AND known.disambiguator IS NOT NULL
			WHERE incoming."songName" = chart_group."songName" AND incoming."type" = chart_group."type"
				AND incoming."difficulty" = chart_group."difficulty"
				AND incoming."region" = slice."region" AND incoming."gameVersion" = slice."gameVersion";

			IF EXISTS (SELECT 1 FROM song_cluster_candidates GROUP BY song_id HAVING COUNT(*) > 1)
				OR EXISTS (SELECT 1 FROM song_cluster_candidates GROUP BY disambiguator HAVING COUNT(*) > 1) THEN
				RAISE EXCEPTION 'parent_song backfill: ambiguous artist matches for %/%/% in %/%',
					chart_group."songName", chart_group."type", chart_group."difficulty", slice."region", slice."gameVersion";
			END IF;

			UPDATE song_clusters sc SET disambiguator = c.disambiguator
			FROM song_cluster_candidates c WHERE sc.song_id = c.song_id;

			SELECT COUNT(*) INTO unmatched_count FROM song_clusters
			WHERE "songName" = chart_group."songName" AND "type" = chart_group."type"
				AND "difficulty" = chart_group."difficulty"
				AND "region" = slice."region" AND "gameVersion" = slice."gameVersion" AND disambiguator IS NULL;
			IF unmatched_count = 0 THEN CONTINUE; END IF;

			SELECT COUNT(*), MIN(slot) INTO available_count, remaining_parent
			FROM generate_series(0::bigint, parent_count - 1) AS slots(slot)
			WHERE NOT EXISTS (SELECT 1 FROM song_cluster_candidates c WHERE c.disambiguator = slots.slot);

			IF unmatched_count <> 1 OR available_count <> 1 THEN
				RAISE EXCEPTION 'parent_song backfill: unresolved chart identities for %/%/% in %/%; audit artist mappings before retrying',
					chart_group."songName", chart_group."type", chart_group."difficulty", slice."region", slice."gameVersion";
			END IF;

			UPDATE song_clusters SET disambiguator = remaining_parent
			WHERE "songName" = chart_group."songName" AND "type" = chart_group."type"
				AND "difficulty" = chart_group."difficulty"
				AND "region" = slice."region" AND "gameVersion" = slice."gameVersion" AND disambiguator IS NULL;
		END LOOP;
	END LOOP;
END $$;
--> statement-breakpoint
DROP TABLE song_cluster_candidates;
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
