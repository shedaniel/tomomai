import "server-only";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { userEvents, userRecentSongs, userSnapshots } from "@/lib/db/schema-pg";
import type { NotFoundScore } from "@/lib/api/schemas";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { getLogger } from "@/lib/request-logger";
import { buildChartResolution, chartKey, writeSnapshotScores, type SnapshotScore } from "./score-storage";
import type { ChartRef, GameFetchResult, NormalizedScore, PersistedSnapshotContext } from "./types";

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
 * Only charts of the fetch's game, region and version are matched. The scores without a match are returned.
 */
export async function persistFetchResult(input: PersistFetchResultInput): Promise<{ context: PersistedSnapshotContext; notFoundScores: NotFoundScore[] }> {
  const { game, region, userId, gameVersion, fetched, deadline } = input;
  const inFetch = (chart: ChartRef) => chart.game === game && chart.region === region && chart.version === gameVersion;

  if (deadline && Date.now() >= deadline) throw new Error("Fetch operation timed out before persistence");
  const { snapshotId, chartResolution, unmatched } = await db.transaction(async tx => {
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

    const recents = (fetched.recents ?? []).flatMap(recent => {
      const songId = inFetch(recent.chart) ? chartResolution.get(chartKey(recent.chart)) : undefined;
      if (songId === undefined) return [];
      return [{ game, userId, songId, playedAt: recent.playedAt,
        scoreValue: recent.scoreValue, secondaryScore: recent.secondaryScore,
        comboStatus: recent.comboStatus, syncStatus: recent.syncStatus, clearStatus: recent.clearStatus,
        track: recent.track,
        maxSecondaryScore: recent.maxSecondaryScore,
      }];
    });
    if (recents.length) await tx.insert(userRecentSongs).values(recents).onConflictDoNothing();
    const events = (fetched.events ?? []).map(event => ({ ...event, game, snapshotId }));
    if (events.length) await tx.insert(userEvents).values(events);
    if (deadline && Date.now() >= deadline) throw new Error("Fetch operation timed out before persistence completed");
    return { snapshotId, chartResolution, unmatched };
  });

  if (unmatched.length > 0) {
    getLogger().warn(
      { count: unmatched.length, songKeys: unmatched.map(score => chartKey(score.chart)), game, region, version: gameVersion },
      "Some scores have no unambiguous catalog match",
    );
  }
  return {
    context: { game, userId, region, snapshotId, gameVersion, chartResolution },
    notFoundScores: unmatched.map(notFoundScore),
  };
}
