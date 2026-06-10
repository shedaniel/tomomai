-- Backfill parent_song from the existing songs rows.
--
-- One parent is created per distinct chart. The chart identity is
-- (songName, type, difficulty) extended by a disambiguator for the rare
-- groups where two genuinely different charts share that key (e.g. the two
-- songs both titled "Link"). Such groups are detected as a real collision:
-- two rows sharing (songName, type, difficulty) inside a single
-- (region, gameVersion). Within a colliding group the rows of one chart are
-- separated from the other chart's rows by addedVersion (guaranteed distinct
-- per (region, gameVersion) by the songs unique constraint).
--
-- Non-colliding groups always collapse into a single parent, regardless of
-- artist/genre/cover drift across versions.

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
		THEN DENSE_RANK() OVER (PARTITION BY s."songName", s."type", s."difficulty" ORDER BY s."addedVersion") - 1
		ELSE 0
	END AS disambiguator
FROM songs s
LEFT JOIN colliding c
	ON c."songName" = s."songName" AND c."type" = s."type" AND c."difficulty" = s."difficulty";
--> statement-breakpoint

-- Parent attributes (and the inherited publicId) come from the preferred
-- child row: latest gameVersion, jp preferred over other regions — the same
-- preference rule the song detail queries use.
INSERT INTO parent_song ("publicId", "songName", "artist", "genre", "cover", "bpm", "type", "difficulty", "disambiguator")
SELECT DISTINCT ON (s."songName", s."type", s."difficulty", sc.disambiguator)
	s."publicId", s."songName", s."artist", s."genre", s."cover", s."bpm", s."type", s."difficulty", sc.disambiguator
FROM songs s
JOIN song_clusters sc ON sc.song_id = s."id"
ORDER BY s."songName", s."type", s."difficulty", sc.disambiguator,
	s."gameVersion" DESC, (s."region" = 'jp') DESC, s."region";
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

	-- A parent owning two children inside one (region, gameVersion) means two
	-- different charts were collapsed into one parent: abort.
	SELECT COUNT(*) INTO n FROM (
		SELECT "parentId", "region", "gameVersion"
		FROM songs
		GROUP BY "parentId", "region", "gameVersion"
		HAVING COUNT(*) > 1
	) dup;
	IF n > 0 THEN
		RAISE EXCEPTION 'parent_song backfill: % (parent, region, gameVersion) groups have multiple children', n;
	END IF;
END $$;
