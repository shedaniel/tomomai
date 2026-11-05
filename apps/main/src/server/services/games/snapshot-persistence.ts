import "server-only";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { userEvents, userRecentSongs, userSnapshots } from "@/lib/db/schema-pg";
import type { NotFoundScore } from "@/lib/api/schemas";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { getVersionFromDate } from "@/lib/games/versions";
import { buildChartResolution, chartKey, recentKey, writeSnapshotScores, type DbSong, type SnapshotScore } from "./score-storage";
import type { ChartRef, GameFetchResult, NormalizedScore, PersistedSnapshotContext } from "./types";
import { logger } from "@/lib/logger";

type PersistFetchResultInput = {
  game: CanonicalGameId;
  region: Region;
  userId: string;
  gameVersion: number;
  fetched: GameFetchResult;
  deadline?: number;
};

function notFoundScore({ chart }: NormalizedScore): NotFoundScore {
  return { songName: chart.songName, difficulty: chart.difficulty, type: chart.chartType };
}

/**
 * Saves a fetched snapshot with its scores, recent plays and events in one transaction.
 * Only charts of the fetch's game, region and version are matched, except that a recent play is matched in the
 * version it was played in when that version has the chart. The scores without a match are returned.
 */
export async function persistFetchResult(input: PersistFetchResultInput): Promise<{ context: PersistedSnapshotContext; notFoundScores: NotFoundScore[] }> {
  const { game, region, userId, gameVersion, fetched, deadline } = input;
  const inFetch = (chart: ChartRef) => chart.game === game && chart.region === region && chart.version === gameVersion;

  if (deadline && Date.now() >= deadline) throw new Error("Fetch operation timed out before persistence");
  const { snapshotId, chartResolution, recentSongIds, unmatched } = await db.transaction(async tx => {
    if (deadline) await tx.execute(sql`SELECT set_config('statement_timeout', ${String(Math.max(1, deadline - Date.now()))}, true)`);
    const { player } = fetched;
    const [insertedSnapshot] = await tx.insert(userSnapshots).values({
      publicId: nanoid(),
      userId,
      game,
      region,
      fetchedAt: new Date(),
      gameVersion,
      rating: player.rating,
      courseRankUrl: player.courseRankUrl ?? null,
      classRankUrl: player.classRankUrl ?? null,
      stars: player.stars ?? null,
      versionPlayCount: player.currentVersionPlayCount,
      totalPlayCount: player.totalPlayCount,
      iconUrl: player.iconUrl,
      displayName: player.displayName,
      title: player.title,
      titleType: player.titleType,
    }).returning({ id: userSnapshots.id });
    const snapshotId = insertedSnapshot.id;

    const { chartResolution, songsById } = await buildChartResolution(tx, game, region, gameVersion);
    const resolvedScores: SnapshotScore[] = [];
    const unmatched: NormalizedScore[] = [];
    for (const score of fetched.scores) {
      const songId = inFetch(score.chart) ? chartResolution.get(chartKey(score.chart)) : undefined;
      const song = songId === undefined ? undefined : songsById.get(songId);
      if (songId === undefined || song === undefined) {
        unmatched.push(score);
        continue;
      }
      const { scoreValue, secondaryScore, comboStatus, syncStatus, clearStatus } = score;
      resolvedScores.push({ song, values: { songId, scoreValue, secondaryScore, comboStatus, syncStatus, clearStatus } });
    }
    await writeSnapshotScores(tx, { game, snapshotId, gameVersion, scores: resolvedScores });

    const resolutions = new Map([[gameVersion, { chartResolution, songsById }]]);
    const recentSongIds = new Map<string, bigint>();
    const recents: (typeof userRecentSongs.$inferInsert)[] = [];
    for (const recent of fetched.recents ?? []) {
      if (!inFetch(recent.chart)) continue;
      // A play keeps the chart of the version it was played in, so fetches either side of a cutoff store it once.
      const playedVersion = getVersionFromDate(game, region, recent.playedAt, gameVersion);
      let song: DbSong | undefined;
      for (const version of new Set([playedVersion, gameVersion])) {
        let resolution = resolutions.get(version);
        if (!resolution) {
          resolution = await buildChartResolution(tx, game, region, version);
          resolutions.set(version, resolution);
        }
        const songId = resolution.chartResolution.get(chartKey(recent.chart));
        song = songId === undefined ? undefined : resolution.songsById.get(songId);
        if (song) break;
      }
      if (!song) continue;
      recentSongIds.set(recentKey(recent), song.id);
      recents.push({ game, userId, songId: song.id, parentId: song.parentId, region, playedAt: recent.playedAt,
        scoreValue: recent.scoreValue, secondaryScore: recent.secondaryScore,
        comboStatus: recent.comboStatus, syncStatus: recent.syncStatus, clearStatus: recent.clearStatus,
        track: recent.track,
        maxSecondaryScore: recent.maxSecondaryScore,
      });
    }
    if (recents.length) await tx.insert(userRecentSongs).values(recents).onConflictDoNothing();
    const events = (fetched.events ?? []).map(event => ({ ...event, game, snapshotId }));
    if (events.length) await tx.insert(userEvents).values(events);
    if (deadline && Date.now() >= deadline) throw new Error("Fetch operation timed out before persistence completed");
    return { snapshotId, chartResolution, recentSongIds, unmatched };
  });

  if (unmatched.length > 0) {
    logger.warn(
      { count: unmatched.length, songKeys: unmatched.map(score => chartKey(score.chart)), game, region, version: gameVersion },
      "Some scores have no unambiguous catalog match",
    );
  }
  return {
    context: { game, userId, region, snapshotId, gameVersion, chartResolution, recentSongIds },
    notFoundScores: unmatched.map(notFoundScore),
  };
}
