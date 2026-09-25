import { parseSongId } from "@/lib/catalog/song-instance-id";
import { getGameCode, getGameChartTypeKey, getGameDifficultyKey } from "@/lib/games/presentation";
import type { CanonicalGameId } from "@/lib/games/types";
import { songInstanceId } from "@/lib/db/song-instance-id";
import { SongDetailChart, SongDetailHistoricalChart, SongDetails } from "@/components/db/songs/types";
import { db } from "@/lib/db";
import { parentSong, scoreData, snapshotScores, songs, userSnapshots } from "@/lib/db/schema-pg";
import { getSongSlugs } from "@/lib/song-slug";
import { Region } from "@/lib/types";
import { maxBy } from "@/lib/utils";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { Optional } from "utility-types";
import { UniqueSong, UniqueSongDifficulty } from "@/components/db/songs/types";

export async function querySongScores(
  game: CanonicalGameId,
  songName: string,
  type: string,
  userId: string,
  artist?: string,
  parentIds?: string[]
): Promise<SongDetails["userScores"]> {
  if (artist === undefined) {
    const artists = await db.selectDistinct({ artist: parentSong.artist })
      .from(parentSong)
      .innerJoin(songs, eq(songs.parentId, parentSong.id))
      .where(and(and(eq(parentSong.game, game), eq(parentSong.songName, songName)), eq(parentSong.type, getGameCode(game, "chartType", type)), parentIds ? inArray(parentSong.publicId, parentIds) : undefined))
      .limit(2);
    if (artists.length > 1) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Artist is required for songs with the same name" });
    }
  }

  const scores = await db
    .select({
      region: songs.region,
      artist: parentSong.artist,
      difficulty: sql`${parentSong.difficulty}`.mapWith(value => getGameDifficultyKey(game, Number(value))).as("difficulty"),
      scoreValue: scoreData.scoreValue,
      comboStatus: scoreData.comboStatus,
      syncStatus: scoreData.syncStatus,
      clearStatus: scoreData.clearStatus,
    })
    .from(snapshotScores)
    .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
    .innerJoin(songs, eq(scoreData.songId, songs.id))
    .innerJoin(parentSong, and(eq(songs.parentId, parentSong.id), eq(songs.game, parentSong.game)))
    .where(
      and(
        and(eq(parentSong.game, game), eq(parentSong.songName, songName)),
        eq(parentSong.type, getGameCode(game, "chartType", type)),
        artist !== undefined ? eq(parentSong.artist, artist) : undefined,
        parentIds ? inArray(parentSong.publicId, parentIds) : undefined,
        inArray(
          snapshotScores.snapshotId,
          db
            .selectDistinctOn([userSnapshots.region], { id: userSnapshots.id })
            .from(userSnapshots)
            .where(and(eq(userSnapshots.game, game), eq(userSnapshots.userId, userId)))
            .orderBy(userSnapshots.region, desc(userSnapshots.fetchedAt))
        )
      )
    );

  if (scores.length === 0) return undefined;
  if (new Set(scores.map(score => score.artist)).size > 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Artist is required for songs with the same name" });
  }

  const userScores: NonNullable<SongDetails["userScores"]> = {};
  for (const score of scores) {
    if (!userScores[score.region]) {
      userScores[score.region] = {};
    }
    userScores[score.region][score.difficulty] = {
      scoreValue: score.scoreValue,
      comboStatus: score.comboStatus,
      syncStatus: score.syncStatus,
      clearStatus: score.clearStatus,
    };
  }
  return userScores;
}

export async function querySongDetails(
  game: CanonicalGameId,
  songName: string,
  type: string,
  userId?: string | null,
  artist?: string,
  parentIds?: string[]
): Promise<SongDetails> {
  const chartsQuery = db
    .select({
      songId: songInstanceId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
      difficulty: sql`${parentSong.difficulty}`.mapWith(value => getGameDifficultyKey(game, Number(value))).as("difficulty"),
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      metadata: songs.metadata,
      type: sql`${parentSong.type}`.mapWith(value => getGameChartTypeKey(game, Number(value))).as("type"),
      genre: parentSong.genre,
      region: songs.region,
      gameVersion: songs.gameVersion,
      addedVersion: songs.addedVersion,
      bpm: parentSong.bpm,
      noteDesigner: songs.noteDesigner,
      tapCount: songs.tapCount,
      holdCount: songs.holdCount,
      slideCount: songs.slideCount,
      touchCount: songs.touchCount,
      breakCount: songs.breakCount,
    })
    .from(songs)
    .innerJoin(parentSong, and(eq(songs.parentId, parentSong.id), eq(songs.game, parentSong.game)))
    .where(and(and(eq(parentSong.game, game), eq(parentSong.songName, songName)), eq(parentSong.type, getGameCode(game, "chartType", type)), artist !== undefined ? eq(parentSong.artist, artist) : undefined, parentIds ? inArray(parentSong.publicId, parentIds) : undefined))
    .orderBy(songs.region, desc(songs.gameVersion), parentSong.difficulty);

  const scoresQuery = userId
    ? querySongScores(game, songName, type, userId, artist, parentIds)
    : Promise.resolve(undefined);

  const [charts, scores] = await Promise.all([chartsQuery, scoresQuery]);

  if (charts.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Song not found" });
  }

  if (new Set(charts.map(chart => chart.artist)).size > 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Artist is required for songs with the same name" });
  }

  const userScoresMap = scores;

  type ChartType = (typeof charts)[number];

  const byRegion = new Map<Region, Map<number, ChartType[]>>();
  for (const chart of charts) {
    if (!byRegion.has(chart.region)) {
      byRegion.set(chart.region, new Map());
    }
    const chartVersion = chart.gameVersion as number;
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
              levelPreciseEstimated: chart.metadata?.levelPreciseEstimated === true,
              addedVersion: chart.addedVersion,
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
              levelPreciseEstimated: chart.metadata?.levelPreciseEstimated === true,
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
    parentIds: [...new Set(charts.map(chart => chart.songId.split(":")[0]))],
    songName: preferredChart.songName,
    artist: preferredChart.artist,
    cover: preferredChart.cover,
    type: preferredChart.type,
    genre: preferredChart.genre,
    bpm: chartBpm ?? null,
    addedVersion: preferredChart.addedVersion,
    userScores: userScoresMap,
    regions,
  } satisfies SongDetails;
}

export async function queryAllUniqueSongs(game: CanonicalGameId) {
  const getCachedUniqueSongs = unstable_cache(
    async () => {
      const allSongs = await db
        .select({
          id: songs.id,
          parentId: parentSong.publicId,
          disambiguator: parentSong.disambiguator,
          songName: parentSong.songName,
          artist: parentSong.artist,
          cover: parentSong.cover,
          type: sql`${parentSong.type}`.mapWith(value => getGameChartTypeKey(game, Number(value))).as("type"),
          genre: parentSong.genre,
          difficulty: sql`${parentSong.difficulty}`.mapWith(value => getGameDifficultyKey(game, Number(value))).as("difficulty"),
          level: songs.level,
          levelPrecise: songs.levelPrecise,
          metadata: songs.metadata,
          noteDesigner: songs.noteDesigner,
          addedVersion: songs.addedVersion,
          region: songs.region,
          gameVersion: songs.gameVersion,
        })
        .from(songs)
        .innerJoin(parentSong, and(eq(songs.parentId, parentSong.id), eq(songs.game, parentSong.game)))
        .where(eq(songs.game, game))
        .orderBy(parentSong.songName);

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
          parentIds: string[];
          difficulties: (UniqueSongDifficulty & { region: Region; gameVersion: number })[];
        }
      > = new Map();
      for (const song of allSongsWithIndex) {
        const key = JSON.stringify([song.songName, song.artist, song.type, song.disambiguator]);
        if (!uniqueSongs.has(key)) {
          uniqueSongs.set(key, { ...song, parentIds: [song.parentId], difficulties: [] });
        } else {
          uniqueSongs.set(key, {
            ...uniqueSongs.get(key)!,
            parentIds: [...new Set([...uniqueSongs.get(key)!.parentIds, song.parentId])],
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
          level: song.level,
          levelPrecise: song.levelPrecise,
          levelPreciseEstimated: song.metadata?.levelPreciseEstimated === true,
          region: song.region,
          gameVersion: song.gameVersion,
          noteDesigner: song.noteDesigner,
        });
      }

      const songsWithSlugs = await getSongSlugs(Array.from(uniqueSongs.values()), game);
      const songsStripped: UniqueSong[] = songsWithSlugs.map((song) => ({
        parentIds: song.parentIds,
        index: song.index,
        songName: song.songName,
        artist: song.artist,
        cover: song.cover,
        type: song.type,
        genre: song.genre,
        addedVersion: song.addedVersion,
        difficulties: song.difficulties
          .map(
            (d) =>
              ({
                difficulty: d.difficulty,
                level: d.level,
                levelPrecise: d.levelPrecise,
                levelPreciseEstimated: d.levelPreciseEstimated,
                noteDesigner: d.noteDesigner,
              }) satisfies UniqueSongDifficulty
          )
          .toSorted(
            (a, b) =>
              getGameCode(game, "difficulty", a.difficulty) - getGameCode(game, "difficulty", b.difficulty)
          ),
        slug: song.disambiguator ? `${song.slug}-${song.disambiguator}` : song.slug,
        aliases: song.aliases,
      }));
      return songsStripped;
    },
    ["all-unique-songs", game, "parent-v2"],
    { revalidate: 3600, tags: [`all-unique-songs:${game}`] }
  );

  return getCachedUniqueSongs();
}

export function queryCatalogCharts(game: CanonicalGameId, region?: Region, gameVersion?: number, publicId?: string) {
  const parsed = publicId === undefined ? undefined : parseSongId(publicId);
  return db.select({
    id: songInstanceId,
    parentId: parentSong.publicId,
    songName: parentSong.songName,
    artist: parentSong.artist,
    cover: parentSong.cover,
    type: parentSong.type,
    difficulty: parentSong.difficulty,
    genre: parentSong.genre,
    region: songs.region,
    gameVersion: songs.gameVersion,
    addedVersion: songs.addedVersion,
    level: songs.level,
    levelPrecise: songs.levelPrecise,
    metadata: songs.metadata,
  }).from(songs)
    .innerJoin(parentSong, and(eq(songs.parentId, parentSong.id), eq(songs.game, parentSong.game)))
    .where(and(
      eq(songs.game, game),
      region ? eq(songs.region, region) : undefined,
      gameVersion !== undefined ? eq(songs.gameVersion, gameVersion) : undefined,
      parsed === null ? sql`false` : parsed ? eq(parentSong.publicId, parsed.parentPublicId) : undefined,
      parsed?.kind === "instance" ? and(eq(songs.region, parsed.region), eq(songs.gameVersion, parsed.gameVersion)) : undefined,
    ))
    .orderBy(parentSong.songName, parentSong.difficulty);
}
