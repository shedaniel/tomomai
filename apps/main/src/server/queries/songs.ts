import { SongDetailChart, SongDetailHistoricalChart, SongDetails } from "@/components/db/songs/types";
import { db } from "@/lib/db";
import { scoreData, snapshotScores, songs, userSnapshots } from "@/lib/db/schema-pg";
import { VersionId } from "@/lib/metadata";
import { getSongSlugs } from "@/lib/song-slug";
import { Region, SongType } from "@/lib/types";
import { maxBy } from "@/lib/utils";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { Optional } from "utility-types";
import { DIFFICULTY_ENUM } from "@/lib/db/types";
import { UniqueSong, UniqueSongDifficulty } from "@/components/db/songs/types";

export async function querySongScores(
  songName: string,
  type: SongType,
  userId: string
): Promise<SongDetails["userScores"]> {
  const scores = await db
    .select({
      region: songs.region,
      difficulty: songs.difficulty,
      achievement: scoreData.achievement,
      fc: scoreData.fc,
      fs: scoreData.fs,
    })
    .from(snapshotScores)
    .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
    .innerJoin(songs, eq(scoreData.songId, songs.id))
    .where(
      and(
        eq(songs.songName, songName),
        eq(songs.type, type),
        inArray(
          snapshotScores.snapshotId,
          db
            .selectDistinctOn([userSnapshots.region], { id: userSnapshots.id })
            .from(userSnapshots)
            .where(eq(userSnapshots.userId, userId))
            .orderBy(userSnapshots.region, desc(userSnapshots.fetchedAt))
        )
      )
    );

  if (scores.length === 0) return undefined;

  const userScores: NonNullable<SongDetails["userScores"]> = {};
  for (const score of scores) {
    if (!userScores[score.region]) {
      userScores[score.region] = {};
    }
    userScores[score.region][score.difficulty] = {
      achievement: score.achievement,
      fc: score.fc,
      fs: score.fs,
    };
  }
  return userScores;
}

export async function querySongDetails(
  songName: string,
  type: SongType,
  userId?: string | null
): Promise<SongDetails> {
  const chartsQuery = db
    .select({
      songId: songs.publicId,
      songName: songs.songName,
      artist: songs.artist,
      cover: songs.cover,
      difficulty: songs.difficulty,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      type: songs.type,
      genre: songs.genre,
      region: songs.region,
      gameVersion: songs.gameVersion,
      addedVersion: songs.addedVersion,
      bpm: songs.bpm,
      noteDesigner: songs.noteDesigner,
      tapCount: songs.tapCount,
      holdCount: songs.holdCount,
      slideCount: songs.slideCount,
      touchCount: songs.touchCount,
      breakCount: songs.breakCount,
    })
    .from(songs)
    .where(and(eq(songs.songName, songName), eq(songs.type, type)))
    .orderBy(songs.region, desc(songs.gameVersion), songs.difficulty);

  const scoresQuery = userId
    ? querySongScores(songName, type, userId)
    : Promise.resolve(undefined);

  const [charts, scores] = await Promise.all([chartsQuery, scoresQuery]);

  if (charts.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Song not found" });
  }

  const userScoresMap = scores;

  type ChartType = (typeof charts)[number];

  const byRegion = new Map<Region, Map<VersionId, ChartType[]>>();
  for (const chart of charts) {
    if (!byRegion.has(chart.region)) {
      byRegion.set(chart.region, new Map());
    }
    const chartVersion = chart.gameVersion as VersionId;
    const regionMap = byRegion.get(chart.region)!;
    if (!regionMap.has(chartVersion)) {
      regionMap.set(chartVersion, []);
    }
    regionMap.get(chartVersion)!.push(chart);
  }

  const regions: SongDetails["regions"] = Array.from(byRegion.entries()).map(([region, versionMap]) => {
    const versions = Array.from(versionMap.entries()).sort(([a], [b]) => b - a);
    return {
      region,
      versions: versions.map(([gameVersion, versionCharts], index) => ({
        gameVersion,
        charts: index === 0
          ? versionCharts.map((chart): SongDetailChart => ({
              difficulty: chart.difficulty,
              level: chart.level,
              levelPrecise: chart.levelPrecise,
              addedVersion: chart.addedVersion as VersionId,
              noteDesigner: chart.noteDesigner,
              tapCount: chart.tapCount,
              holdCount: chart.holdCount,
              slideCount: chart.slideCount,
              touchCount: chart.touchCount,
              breakCount: chart.breakCount,
            }))
          : versionCharts.map((chart): SongDetailHistoricalChart => ({
              difficulty: chart.difficulty,
              levelPrecise: chart.levelPrecise,
            })),
      })),
    };
  });

  const preferredChart: ChartType = maxBy(
    charts,
    (chart) => chart.gameVersion * 100 + (chart.region === "jp" ? 1 : 0)
  )!;
  const chartBpm = preferredChart.bpm || charts.find((c) => c.bpm !== null)?.bpm;

  return {
    songName: preferredChart.songName,
    artist: preferredChart.artist,
    cover: preferredChart.cover,
    type: preferredChart.type,
    genre: preferredChart.genre,
    bpm: chartBpm ?? null,
    addedVersion: preferredChart.addedVersion as VersionId,
    userScores: userScoresMap,
    regions,
  } satisfies SongDetails;
}

export async function queryAllUniqueSongs() {
  // Uploads invalidate this tag and the affected routes; 30 days is only the
  // fallback freshness window shared by the list, detail, and sitemap routes.
  const getCachedUniqueSongs = unstable_cache(
    async () => {
      const allSongs = await db
        .select({
          id: songs.id,
          songName: songs.songName,
          artist: songs.artist,
          cover: songs.cover,
          type: songs.type,
          genre: songs.genre,
          difficulty: songs.difficulty,
          levelPrecise: songs.levelPrecise,
          noteDesigner: songs.noteDesigner,
          addedVersion: songs.addedVersion,
          region: songs.region,
          gameVersion: songs.gameVersion,
        })
        .from(songs)
        .orderBy(songs.songName);

      const allSongsSortedById = [...allSongs].sort((a, b) => Number(a.id) - Number(b.id));
      const allSongsToSortedIndex = Object.fromEntries(
        allSongsSortedById.map((song, index) => [String(song.id), index])
      );
      const allSongsWithIndex = allSongs.map(
        (song) =>
          ({
            ...song,
            index: allSongsToSortedIndex[String(song.id)]!,
          }) satisfies Optional<typeof song, "id"> & { index: number }
      );

      const uniqueSongs: Map<
        string,
        (typeof allSongsWithIndex)[0] & {
          difficulties: (UniqueSongDifficulty & { region: Region; gameVersion: number })[];
        }
      > = new Map();
      for (const song of allSongsWithIndex) {
        const key = `${song.songName}||${song.type}`;
        if (!uniqueSongs.has(key)) {
          uniqueSongs.set(key, { ...song, difficulties: [] });
        } else {
          uniqueSongs.set(key, {
            ...uniqueSongs.get(key)!,
            difficulties: [...uniqueSongs.get(key)!.difficulties],
            ...song,
          });
        }
        const existingDifficulty = uniqueSongs
          .get(key)!
          .difficulties.find((d) => d.difficulty === song.difficulty);
        if (existingDifficulty) {
          if (
            existingDifficulty.gameVersion < song.gameVersion ||
            (existingDifficulty.gameVersion === song.gameVersion &&
              song.region === "jp" &&
              existingDifficulty.region === "intl")
          ) {
            uniqueSongs
              .get(key)!
              .difficulties.splice(
                uniqueSongs.get(key)!.difficulties.indexOf(existingDifficulty),
                1
              );
          } else continue;
        }

        uniqueSongs.get(key)!.difficulties.push({
          difficulty: song.difficulty,
          levelPrecise: song.levelPrecise,
          region: song.region,
          gameVersion: song.gameVersion,
          noteDesigner: song.noteDesigner,
        });
      }

      const songsWithSlugs = await getSongSlugs(Array.from(uniqueSongs.values()));
      const songsStripped: UniqueSong[] = songsWithSlugs.map((song) => ({
        index: song.index,
        songName: song.songName,
        artist: song.artist,
        cover: song.cover,
        type: song.type,
        genre: song.genre,
        addedVersion: song.addedVersion as VersionId,
        difficulties: song.difficulties
          .map(
            (d) =>
              ({
                difficulty: d.difficulty,
                levelPrecise: d.levelPrecise,
                noteDesigner: d.noteDesigner,
              }) satisfies UniqueSongDifficulty
          )
          .toSorted(
            (a, b) =>
              DIFFICULTY_ENUM.indexOf(a.difficulty) - DIFFICULTY_ENUM.indexOf(b.difficulty)
          ),
        slug: song.slug,
        aliases: song.aliases,
      }));
      return songsStripped;
    },
    ["all-unique-songs"],
    { revalidate: 2592000, tags: ["all-unique-songs"] }
  );

  return getCachedUniqueSongs();
}
