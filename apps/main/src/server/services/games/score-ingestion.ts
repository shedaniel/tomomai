import { GAME_SERVER_MODULES } from "./registry";
import { readToken, saveToken } from "./tokens";
import { getGameMaintenance, getGameMaintenanceError } from "@/lib/games/maintenance";
import { revalidatePublicProfileForUser } from "@/lib/profile-cache";
import { buildChartResolution, chartKey, scoreDataKey, upsertScoreData, type DbSong } from "./score-storage";
import { resolveFlagsForUser, type Flags } from "@/lib/flags";
import { and, desc, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { nanoid } from "nanoid";

import { db } from "@/lib/db";
import {
  fetchSessions,
  userRecentSongs,
  userEvents,
  snapshotRankings,
  snapshotScores,
  user,
  userSnapshots,
} from "@/lib/db/schema-pg";
import { appendFetchState } from "@/lib/fetch-states-server";
import { getCurrentVersion } from "@/lib/games/versions";
import { RANKING_BUCKET_CODE, keyOf } from "@/lib/games/codes";
import { getGame, resolveGameContext } from "@/lib/games/registry";
import type { CanonicalGameId } from "@/lib/games/types";
import type { GameFetchResult, NormalizedScore, PersistedSnapshotContext, ScoreFetchContext } from "./types";
import { flushLogger } from "@/lib/logger";
import type { Region } from "@/lib/types";
import { getLogger } from "@/lib/request-logger";

type BackgroundWorkRef = { promise: Promise<void> };

export type StartScoreFetchResult = {
  sessionId: string;
  status: "pending";
  backgroundWork?: Promise<void>;
};

export type NotFoundScore = {
  songName: string;
  difficulty: string;
  musicType: string;
};

export type ScoreFetchStatusResult = {
  id: string;
  status: "pending" | "completed" | "failed";
  startedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
  statusStates: string | null;
  notFoundScores: NotFoundScore[] | null;
};

export type ScorePersistExtra = (
  ctx: PersistedSnapshotContext,
  backgroundWorkRef?: BackgroundWorkRef,
) => Promise<void>;

export type PersistFetchResultInput = {
  game: CanonicalGameId;
  region: Region;
  userId: string;
  sessionId: bigint;
  gameVersion: number;
  fetched: GameFetchResult;
  backgroundWorkRef?: BackgroundWorkRef;
  persistExtra?: ScorePersistExtra;
  deadline?: number;
};

type ResolvedScore = {
  score: NormalizedScore;
  song: DbSong;
  songId: bigint;
  dataKey: string;
};

type RankedResolvedScore = {
  chartId: string;
  scoreValue: number;
  addedVersion: number;
  rating: number;
  scoreId: number;
};

function codeName(game: CanonicalGameId, kind: "difficulty" | "chartType", code: number): string {
  return keyOf(game, kind, code) ?? String(code);
}

function notFoundScore(game: CanonicalGameId, score: NormalizedScore): NotFoundScore {
  return {
    songName: score.chart.songName,
    difficulty: codeName(game, "difficulty", score.chart.difficulty),
    musicType: codeName(game, "chartType", score.chart.chartType),
  };
}

function parseNotFoundScores(extraData: unknown): NotFoundScore[] | null {
  let parsed = extraData;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return null;
    }
  }

  if (typeof parsed !== "object" || parsed === null || !("notFoundScores" in parsed)) {
    return null;
  }
  const value = (parsed as { notFoundScores?: unknown }).notFoundScores;
  return Array.isArray(value) ? value as NotFoundScore[] : null;
}

async function demoScoreFetch(
  userId: string,
  game: CanonicalGameId,
  region: Region,
): Promise<StartScoreFetchResult> {
  const publicId = nanoid();
  const [insertedSession] = await db.insert(fetchSessions).values({
    publicId,
    userId,
    game,
    region,
    status: "pending",
    startedAt: new Date(),
  }).returning({ id: fetchSessions.id });

  void (async () => {
    try {
      for (const state of getGame(game).fetchStages) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await appendFetchState(insertedSession.id, state, game);
      }

      await db
        .update(fetchSessions)
        .set({ status: "completed", completedAt: new Date() })
        .where(and(eq(fetchSessions.id, insertedSession.id), eq(fetchSessions.game, game)));
    } catch (error) {
      getLogger().error({ err: error, game, region }, "Error during demo score fetch");
      await db
        .update(fetchSessions)
        .set({
          status: "failed",
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Unknown error occurred",
        })
        .where(and(eq(fetchSessions.id, insertedSession.id), eq(fetchSessions.game, game)));
    }
  })();

  return { sessionId: publicId, status: "pending" };
}

export async function startScoreFetch(input: {
  userId: string;
  game: CanonicalGameId;
  region: Region;
  token?: string;
  flags?: Flags;
  options?: { skipAfter?: boolean };
}): Promise<StartScoreFetchResult> {
  const context = resolveGameContext(input.game, input.region, "scores");
  const scoreSource = GAME_SERVER_MODULES[context.game].scores;

  if (process.env.DEMO_FETCH === "true") {
    return demoScoreFetch(input.userId, context.game, context.region);
  }

  const maintenance = getGameMaintenance(context.game, context.region);
  if (maintenance?.active) throw new Error(getGameMaintenanceError(maintenance));

  const gameVersion = getCurrentVersion(context.game, context.region);
  let tokenToUse = input.token;
  if (!tokenToUse) {
    tokenToUse = await readToken(context.game, input.userId, context.region) ?? undefined;
    if (!tokenToUse) {
      throw new Error("NO_TOKEN_FOUND: No authentication token found. Please add your authentication token first.");
    }
  }

  const flags = input.flags ?? await resolveFlagsForUser(input.userId);
  await scoreSource.validateToken?.({ token: tokenToUse, tokenProvided: Boolean(input.token) });

  if (input.token) {
    await saveToken(context.game, input.userId, context.region, tokenToUse);
  }

  const albumsSupported = getGame(context.game).capabilities.includes("albums");
  let shouldFetchAlbums = false;
  if (albumsSupported) {
    const userPreference = await db
      .select({ fetchUseAlbums: user.fetchUseAlbums })
      .from(user)
      .where(eq(user.id, input.userId))
      .limit(1);

    if (userPreference.length === 0 || userPreference[0].fetchUseAlbums === null) {
      throw new Error("NO_USE_ALBUMS_SETTINGS: No fetch albums settings preference set. Please set this option on the website by fetching once first.");
    }
    shouldFetchAlbums = userPreference[0].fetchUseAlbums;
  }

  const existingFetch = await db
    .select()
    .from(fetchSessions)
    .where(and(
      eq(fetchSessions.userId, input.userId),
      eq(fetchSessions.game, context.game),
      eq(fetchSessions.region, context.region),
      eq(fetchSessions.status, "pending"),
    ));

  if (existingFetch.length > 0) {
    const threeMinutes = 3 * 60 * 1000;
    const now = Date.now();
    const oldFetches = existingFetch.filter(fetch => now - fetch.startedAt.getTime() > threeMinutes);

    for (const oldFetch of oldFetches) {
      await db
        .update(fetchSessions)
        .set({
          status: "failed",
          completedAt: new Date(),
          errorMessage: "Fetch timed out after 3 minutes",
        })
        .where(and(eq(fetchSessions.id, oldFetch.id), eq(fetchSessions.game, context.game)));
    }

    const recentPendingFetches = existingFetch.filter(fetch => now - fetch.startedAt.getTime() <= threeMinutes);
    if (recentPendingFetches.length > 0) {
      throw new Error("A fetch is already in progress for this region");
    }
  }

  const recentFetches = await db
    .select()
    .from(fetchSessions)
    .where(and(
      eq(fetchSessions.userId, input.userId),
      eq(fetchSessions.game, context.game),
      eq(fetchSessions.region, context.region),
    ))
    .orderBy(desc(fetchSessions.startedAt))
    .limit(5);

  if (recentFetches.length >= 5) {
    const fifthMostRecentFetch = recentFetches[4];
    const timeSinceOldestInWindow = Date.now() - fifthMostRecentFetch.startedAt.getTime();
    const fiveMinutes = 5 * 60 * 1000;
    if (timeSinceOldestInWindow < fiveMinutes) {
      const remainingTime = Math.ceil((fiveMinutes - timeSinceOldestInWindow) / 1000);
      throw new Error(`Rate limited. You can make 5 requests per 5 minutes. Try again in ${remainingTime} seconds.`);
    }
  }

  const publicId = nanoid();
  const [insertedSession] = await db.insert(fetchSessions).values({
    publicId,
    userId: input.userId,
    game: context.game,
    region: context.region,
    status: "pending",
    startedAt: new Date(),
  }).returning({ id: fetchSessions.id });
  const sessionId = insertedSession.id;
  const controller = new AbortController();
  const fetchContext = {
    game: context.game,
    userId: input.userId,
    region: context.region,
    sessionId,
    gameVersion,
    flags,
    token: tokenToUse,
    shouldFetchAlbums,
    signal: controller.signal,
  } satisfies ScoreFetchContext;

  const fetchWork = async () => {
    const backgroundWorkRef: BackgroundWorkRef = { promise: Promise.resolve() };
    try {
      const deadline = Date.now() + 2 * 60 * 1000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const sourceResult = await Promise.race([
        scoreSource.fetch(fetchContext),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error("Fetch operation timed out after 2 minutes");
            controller.abort(error);
            reject(error);
          }, 2 * 60 * 1000);
        }),
      ]).finally(() => clearTimeout(timer));
      await persistFetchResult({
        game: context.game, region: context.region, userId: input.userId,
        sessionId, gameVersion, fetched: sourceResult.result,
        backgroundWorkRef, persistExtra: sourceResult.persistExtra, deadline,
      });

      await db
        .update(fetchSessions)
        .set({ status: "completed", completedAt: new Date() })
        .where(and(eq(fetchSessions.id, sessionId), eq(fetchSessions.game, context.game)));
    } catch (error) {
      getLogger().error({ err: error, game: context.game, region: context.region }, "Error during score fetch");
      await db
        .update(fetchSessions)
        .set({
          status: "failed",
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Unknown error occurred",
        })
        .where(and(eq(fetchSessions.id, sessionId), eq(fetchSessions.game, context.game)));
    } finally {
      await backgroundWorkRef.promise;
      await flushLogger();
    }
  };

  const result: StartScoreFetchResult = { sessionId: publicId, status: "pending" };
  if (input.options?.skipAfter) {
    result.backgroundWork = fetchWork();
  } else {
    after(fetchWork);
  }
  return result;
}

export async function getScoreFetchStatus(input: {
  userId: string;
  game: CanonicalGameId;
  region: Region;
}): Promise<ScoreFetchStatusResult | null> {
  const fetchSession = await db
    .select({
      id: fetchSessions.publicId,
      status: fetchSessions.status,
      startedAt: fetchSessions.startedAt,
      completedAt: fetchSessions.completedAt,
      errorMessage: fetchSessions.errorMessage,
      statusStates: fetchSessions.statusStates,
      extraData: fetchSessions.extraData,
    })
    .from(fetchSessions)
    .where(and(
      eq(fetchSessions.userId, input.userId),
      eq(fetchSessions.game, input.game),
      eq(fetchSessions.region, input.region),
    ))
    .orderBy(desc(fetchSessions.startedAt))
    .limit(1);

  if (fetchSession.length === 0) return null;

  const session = fetchSession[0];
  return {
    id: session.id,
    status: session.status,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    errorMessage: session.errorMessage,
    statusStates: session.statusStates,
    notFoundScores: parseNotFoundScores(session.extraData),
  };
}

export async function persistFetchResult(input: PersistFetchResultInput): Promise<{ snapshotId: number }> {
  if (input.deadline && Date.now() >= input.deadline) throw new Error("Fetch operation timed out before persistence");
  const { snapshotId, gameVersion, chartResolution } = await db.transaction(async tx => {
    if (input.deadline) await tx.execute(sql`SELECT set_config('statement_timeout', ${String(Math.max(1, input.deadline - Date.now()))}, true)`);
    const definition = getGame(input.game);
    const gameVersion = input.gameVersion;
    const player = input.fetched.player;
    const publicId = nanoid();
    const [insertedSnapshot] = await tx.insert(userSnapshots).values({
      publicId,
      userId: input.userId,
      game: input.game,
      region: input.region,
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

    const { chartResolution, songsById } = await buildChartResolution(tx, input.game, input.region, gameVersion);
    const resolvedScores: ResolvedScore[] = [];
    const notFoundScores: NotFoundScore[] = [];
    const seenScoreData = new Set<string>();

    for (const score of input.fetched.scores) {
      if (
        score.chart.game !== input.game
        || score.chart.region !== input.region
        || score.chart.version !== gameVersion
      ) {
        notFoundScores.push(notFoundScore(input.game, score));
        continue;
      }

      const songId = chartResolution.get(chartKey(score.chart));
      const song = songId === undefined ? undefined : songsById.get(songId);
      if (songId === undefined || song === undefined) {
        notFoundScores.push(notFoundScore(input.game, score));
        continue;
      }

      const dataKey = scoreDataKey({ songId, ...score });
      if (seenScoreData.has(dataKey)) continue;
      seenScoreData.add(dataKey);
      resolvedScores.push({ score, song, songId, dataKey });
    }

    const scoreDataLookup = await upsertScoreData(tx, input.game, resolvedScores.map(({ songId, score }) => ({ songId, ...score })));
    const junctionRows: (typeof snapshotScores.$inferInsert)[] = [];
    const insertedScoreIds = new Set<number>();
    for (const resolved of resolvedScores) {
      const scoreId = scoreDataLookup.get(resolved.dataKey);
      if (scoreId === undefined || insertedScoreIds.has(scoreId)) continue;
      insertedScoreIds.add(scoreId);
      junctionRows.push({ game: input.game, snapshotId, scoreId });
    }

    for (let index = 0; index < junctionRows.length; index += 1000) {
      await tx.insert(snapshotScores).values(junctionRows.slice(index, index + 1000)).onConflictDoNothing();
    }

    if (definition.capabilities.includes("rankings") && resolvedScores.length > 0) {
      const rankedScores: RankedResolvedScore[] = [];
      for (const resolved of resolvedScores) {
        const scoreId = scoreDataLookup.get(resolved.dataKey);
        if (scoreId === undefined) continue;
        rankedScores.push({
          chartId: resolved.song.id.toString(),
          scoreValue: resolved.score.scoreValue,
          addedVersion: resolved.song.addedVersion,
          rating: definition.rating.chartRating({
            scoreValue: resolved.score.scoreValue,
            levelPrecise: resolved.song.levelPrecise,
            difficulty: resolved.song.difficulty,
            comboStatus: resolved.score.comboStatus,
          }, gameVersion),
          scoreId,
        });
      }

      const rankingSelection = definition.rating.selectRankings(rankedScores, gameVersion);
      const rankingRows: (typeof snapshotRankings.$inferInsert)[] = [
        ...rankingSelection.newScores.map((score, rank) => ({
          game: input.game,
          snapshotId,
          bucket: RANKING_BUCKET_CODE.new,
          rank,
          scoreId: score.scoreId,
        })),
        ...rankingSelection.oldScores.map((score, rank) => ({
          game: input.game,
          snapshotId,
          bucket: RANKING_BUCKET_CODE.old,
          rank,
          scoreId: score.scoreId,
        })),
      ];
      if (rankingRows.length > 0) {
        await tx.insert(snapshotRankings).values(rankingRows).onConflictDoNothing();
      }
    }

    if (notFoundScores.length > 0) {
      await tx
        .update(fetchSessions)
        .set({ extraData: JSON.stringify({ notFoundScores }) })
        .where(and(eq(fetchSessions.id, input.sessionId), eq(fetchSessions.game, input.game)));
    }

    const recents = (input.fetched.recents ?? []).flatMap(recent => {
      if (recent.chart.game !== input.game || recent.chart.region !== input.region || recent.chart.version !== gameVersion) return [];
      const songId = chartResolution.get(chartKey(recent.chart));
      if (songId === undefined) return [];
      return [{ game: input.game, userId: input.userId, songId, playedAt: recent.playedAt,
        scoreValue: recent.scoreValue, secondaryScore: recent.secondaryScore,
        comboStatus: recent.comboStatus, syncStatus: recent.syncStatus, clearStatus: recent.clearStatus,
        maxDxScore: recent.maxDxScore,
        track: recent.track,
        metadata: recent.details,
      }];
    });
    if (recents.length) await tx.insert(userRecentSongs).values(recents).onConflictDoNothing();
    const events = (input.fetched.events ?? []).map(event => ({ ...event, game: input.game, snapshotId }));
    if (events.length) await tx.insert(userEvents).values(events);
    if (input.deadline && Date.now() >= input.deadline) throw new Error("Fetch operation timed out before persistence completed");
    return { snapshotId, gameVersion, chartResolution };
  });
  if (input.persistExtra) {
    await input.persistExtra({
      game: input.game,
      userId: input.userId,
      region: input.region,
      sessionId: input.sessionId,
      snapshotId,
      gameVersion,
      chartResolution,
    }, input.backgroundWorkRef);
  }

  await revalidatePublicProfileForUser(input.game, input.userId, [input.region]);

  return { snapshotId };
}
