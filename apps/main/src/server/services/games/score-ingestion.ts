import { maimaiScoreAdapter } from "@/lib/games/adapters/maimai/score";
import { and, desc, eq, sql, getTableColumns } from "drizzle-orm";
import { after } from "next/server";
import { nanoid } from "nanoid";

import { db } from "@/lib/db";
import {
  fetchSessions,
  scoreData,
  songs,
  parentSong,
  userRecentSongs,
  userEvents,
  userAlbums,
  snapshotRankings,
  snapshotScores,
  user,
  userSnapshots,
  userTokens,
} from "@/lib/db/schema-pg";
import { getAllStates } from "@/lib/fetch-states";
import { appendFetchState } from "@/lib/fetch-states-server";
import { getCurrentVersion } from "@/lib/games/versions";
import {
  GAME_REGISTRY,
  requireCapability,
  requireConfiguredSource,
  resolveGameContext,
} from "@/lib/games/registry";
import {
  GameAdapterError,
  RANKING_BUCKET,
  type CanonicalGameId,
  type ChartResolutionMap,
  type GameFetchResult,
  type NormalizedScore,
  type PersistedSnapshotContext,
  type ScoreAdapter,
} from "@/lib/games/types";
import { flushLogger } from "@/lib/logger";
import { decryptToken, encryptToken } from "@/lib/token-crypto";
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

type DbSong = typeof songs.$inferSelect & Pick<typeof parentSong.$inferSelect, "songName" | "difficulty" | "type">;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ResolvedScore = {
  score: NormalizedScore;
  song: DbSong;
  songId: bigint;
  dataKey: string;
};

type RankedResolvedScore = {
  chartId: string;
  addedVersion: number;
  rating: number;
  scoreId: number;
};

function supportsCapability(
  game: CanonicalGameId,
  capability: Parameters<typeof requireCapability>[1],
  region: Region,
): boolean {
  try {
    requireCapability(game, capability, region);
    return true;
  } catch (error) {
    if (error instanceof GameAdapterError && error.code === "UNSUPPORTED_CAPABILITY") {
      return false;
    }
    throw error;
  }
}

function chartKey(score: NormalizedScore): string {
  return `${score.chart.songName}|${score.chart.difficulty}|${score.chart.chartType}`;
}

function scoreDataKey(
  songId: bigint,
  scoreValue: number,
  secondaryScore: number,
  comboStatus: number,
  syncStatus: number,
  clearStatus: number,
): string {
  return `${songId}-${scoreValue}-${secondaryScore}-${comboStatus}-${syncStatus}-${clearStatus}`;
}

function statusCodeName(
  game: CanonicalGameId,
  category: "difficulty" | "chartType",
  code: number,
): string {
  const name = GAME_REGISTRY[game].adapter.codes[category][code];
  if (category === "chartType" && name === "standard") return "std";
  return name ?? String(code);
}

function notFoundScore(game: CanonicalGameId, score: NormalizedScore): NotFoundScore {
  return {
    songName: score.chart.songName,
    difficulty: statusCodeName(game, "difficulty", score.chart.difficulty),
    musicType: statusCodeName(game, "chartType", score.chart.chartType),
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
      for (const state of getAllStates()) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (game === "maimai") await appendFetchState(insertedSession.id, state);
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
  flags: import("@/lib/flags").Flags;
  options?: { skipAfter?: boolean };
  scoreAdapter?: ScoreAdapter;
}): Promise<StartScoreFetchResult> {
  let context: ReturnType<typeof resolveGameContext>;
  try {
    context = resolveGameContext(input.game, input.region, "scores");
  } catch (error) {
    if (error instanceof GameAdapterError && error.code === "GAME_NOT_ENABLED") {
      requireConfiguredSource(input.game, "scores");
    }
    throw error;
  }

  requireConfiguredSource(context.game, "scores");
  const scoreAdapter = input.scoreAdapter ?? (context.game === "maimai" ? maimaiScoreAdapter : GAME_REGISTRY[context.game].adapter.scores);
  if (!scoreAdapter.fetch) {
    throw new GameAdapterError(
      "SOURCE_NOT_CONFIGURED",
      `scores source has no fetcher for ${context.game}`,
      context.game,
      context.region,
      "scores",
    );
  }

  if (process.env.DEMO_FETCH === "true") {
    return demoScoreFetch(input.userId, context.game, context.region);
  }

  const gameVersion = getCurrentVersion(context.game, context.region);
  let tokenToUse = input.token;
  if (!tokenToUse) {
    const savedToken = await db
      .select({ token: userTokens.token })
      .from(userTokens)
      .where(and(
        eq(userTokens.userId, input.userId),
        eq(userTokens.game, context.game),
        eq(userTokens.region, context.region),
      ))
      .limit(1);

    if (savedToken.length === 0) {
      throw new Error("NO_TOKEN_FOUND: No authentication token found. Please add your authentication token first.");
    }

    try {
      tokenToUse = decryptToken(savedToken[0].token);
    } catch (error) {
      getLogger().error({ err: error, game: context.game, region: context.region }, "Failed to decrypt token");
      throw new Error("Failed to decrypt stored token. Please re-add your authentication tokens.");
    }
  }

  await scoreAdapter.validateToken?.({
    userId: input.userId,
    region: context.region,
    flags: input.flags,
    token: tokenToUse,
    tokenProvided: Boolean(input.token),
  });

  if (input.token) {
    const encryptedToken = encryptToken(tokenToUse);
    const updatedAt = new Date();
    await db.insert(userTokens).values({
      userId: input.userId,
      game: context.game,
      region: context.region,
      token: encryptedToken,
      createdAt: updatedAt,
      updatedAt,
    }).onConflictDoUpdate({
      target: [userTokens.userId, userTokens.game, userTokens.region],
      set: { token: encryptedToken, updatedAt },
    });
  }

  const albumsSupported = supportsCapability(context.game, "albums", context.region);
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
  const fetchContext = {
    userId: input.userId,
    region: context.region,
    sessionId,
    gameVersion,
    flags: input.flags,
    token: tokenToUse,
    extra: {
      shouldFetchAlbums,
    },
  } satisfies import("@/lib/games/types").ScoreFetchContext;

  const fetchWork = async () => {
    const backgroundWorkRef: BackgroundWorkRef = { promise: Promise.resolve() };
    try {
      const deadline = Date.now() + 2 * 60 * 1000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const adapterResult = await Promise.race([
        scoreAdapter.fetch!(fetchContext),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Fetch operation timed out after 2 minutes")), 2 * 60 * 1000);
        }),
      ]).finally(() => clearTimeout(timer));
      await persistFetchResult({
        game: context.game, region: context.region, userId: input.userId,
        sessionId, gameVersion, fetched: adapterResult.result,
        backgroundWorkRef, persistExtra: adapterResult.persistExtra, deadline,
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
    status: session.status as ScoreFetchStatusResult["status"],
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    errorMessage: session.errorMessage,
    statusStates: session.statusStates,
    notFoundScores: parseNotFoundScores(session.extraData),
  };
}

async function buildChartResolution(
  tx: Transaction,
  game: CanonicalGameId,
  region: Region,
  gameVersion: number,
): Promise<{ chartResolution: ChartResolutionMap; songsById: Map<bigint, DbSong> }> {
  const allSongs = await tx.select({ ...getTableColumns(songs), songName: parentSong.songName, difficulty: parentSong.difficulty, type: parentSong.type })
    .from(songs).innerJoin(parentSong, and(eq(parentSong.id, songs.parentId), eq(parentSong.game, songs.game)))
    .where(and(eq(songs.game, game), eq(songs.region, region), eq(songs.gameVersion, gameVersion)));

  const chartResolution: ChartResolutionMap = new Map();
  const songsById = new Map<bigint, DbSong>();
  const codes = GAME_REGISTRY[game].adapter.codes;

  const ambiguous = new Set<string>();
  const add = (key: string, id: bigint) => {
    if (ambiguous.has(key)) return;
    if (chartResolution.has(key)) { chartResolution.delete(key); ambiguous.add(key); }
    else chartResolution.set(key, id);
  };
  for (const song of allSongs) {
    add(`${song.songName}|${song.difficulty}|${song.type}`, song.id);
    const difficultyName = codes.difficulty[song.difficulty];
    const chartTypeName = codes.chartType[song.type];
    if (difficultyName && chartTypeName) {
      add(`${song.songName}|${difficultyName}|${chartTypeName}`, song.id);
      if (chartTypeName === "standard") {
        add(`${song.songName}|${difficultyName}|std`, song.id);
      }
    }
    songsById.set(song.id, song);
  }

  return { chartResolution, songsById };
}

async function upsertNormalizedScores(
  tx: Transaction,
  game: CanonicalGameId,
  scores: ResolvedScore[],
): Promise<Map<string, number>> {
  const uniqueScores = new Map<string, ResolvedScore>();
  for (const resolved of scores) {
    uniqueScores.set(resolved.dataKey, resolved);
  }

  const insertValues = [...uniqueScores.values()]
    .map(({ score, songId }) => ({
      game,
      songId,
      scoreValue: score.scoreValue,
      secondaryScore: score.secondaryScore,
      comboStatus: score.comboStatus,
      syncStatus: score.syncStatus,
      clearStatus: score.clearStatus,
    }))
    .sort((a, b) =>
      (a.songId < b.songId ? -1 : a.songId > b.songId ? 1 : 0)
      || a.scoreValue - b.scoreValue
      || a.secondaryScore - b.secondaryScore
      || a.comboStatus - b.comboStatus
      || a.syncStatus - b.syncStatus
      || a.clearStatus - b.clearStatus,
    );

  const scoreDataLookup = new Map<string, number>();
  for (let index = 0; index < insertValues.length; index += 1000) {
    const rows = await tx.insert(scoreData)
      .values(insertValues.slice(index, index + 1000))
      .onConflictDoUpdate({
        target: [
          scoreData.songId,
          scoreData.scoreValue,
          scoreData.secondaryScore,
          scoreData.comboStatus,
          scoreData.syncStatus,
          scoreData.clearStatus,
        ],
        set: { songId: sql`excluded."songId"` },
      })
      .returning({
        id: scoreData.id,
        songId: scoreData.songId,
        scoreValue: scoreData.scoreValue,
        secondaryScore: scoreData.secondaryScore,
        comboStatus: scoreData.comboStatus,
        syncStatus: scoreData.syncStatus,
        clearStatus: scoreData.clearStatus,
      });

    for (const row of rows) {
      scoreDataLookup.set(
        scoreDataKey(
          row.songId,
          row.scoreValue,
          row.secondaryScore,
          row.comboStatus,
          row.syncStatus,
          row.clearStatus,
        ),
        row.id,
      );
    }
  }

  return scoreDataLookup;
}

export async function persistFetchResult(input: PersistFetchResultInput): Promise<{ snapshotId: number }> {
  if (input.deadline && Date.now() >= input.deadline) throw new Error("Fetch operation timed out before persistence");
  const { snapshotId, gameVersion, chartResolution } = await db.transaction(async tx => {
  if (input.deadline) await tx.execute(sql`SELECT set_config('statement_timeout', ${String(Math.max(1, input.deadline - Date.now()))}, true)`);
  const gameAdapter = GAME_REGISTRY[input.game].adapter;
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
    metadata: player.metadata ?? null,
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

    const songId = chartResolution.get(chartKey(score));
    const song = songId === undefined ? undefined : songsById.get(songId);
    if (songId === undefined || song === undefined) {
      notFoundScores.push(notFoundScore(input.game, score));
      continue;
    }

    const dataKey = scoreDataKey(
      songId,
      score.scoreValue,
      score.secondaryScore,
      score.comboStatus,
      score.syncStatus,
      score.clearStatus,
    );
    if (seenScoreData.has(dataKey)) continue;
    seenScoreData.add(dataKey);
    resolvedScores.push({ score, song, songId, dataKey });
  }

  const scoreDataLookup = await upsertNormalizedScores(tx, input.game, resolvedScores);
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

  if (supportsCapability(input.game, "rankings", input.region) && resolvedScores.length > 0) {
    const rankedScores: RankedResolvedScore[] = [];
    for (const resolved of resolvedScores) {
      const scoreId = scoreDataLookup.get(resolved.dataKey);
      if (scoreId === undefined || resolved.song.levelPrecise === null || resolved.song.addedVersion === null) continue;
      rankedScores.push({
        chartId: resolved.song.id.toString(),
        addedVersion: resolved.song.addedVersion,
        rating: gameAdapter.calculateChartRating({
          scoreValue: resolved.score.scoreValue,
          levelPrecise: resolved.song.levelPrecise,
          difficulty: resolved.song.difficulty,
          comboStatus: resolved.score.comboStatus,
        }, gameVersion),
        scoreId,
      });
    }

    const rankingSelection = gameAdapter.selectRankings(rankedScores, gameVersion);
    const rankingRows: (typeof snapshotRankings.$inferInsert)[] = [
      ...rankingSelection.newScores.map((score, rank) => ({
        game: input.game,
        snapshotId,
        bucket: RANKING_BUCKET.new,
        rank,
        scoreId: score.scoreId,
      })),
      ...rankingSelection.oldScores.map((score, rank) => ({
        game: input.game,
        snapshotId,
        bucket: RANKING_BUCKET.old,
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
    const songId = chartResolution.get(chartKey(recent));
    if (songId === undefined) return [];
    const details = recent.details ?? {};
    return [{ game: input.game, userId: input.userId, songId, playedAt: recent.playedAt,
      scoreValue: recent.scoreValue, secondaryScore: recent.secondaryScore,
      comboStatus: recent.comboStatus, syncStatus: recent.syncStatus, clearStatus: recent.clearStatus,
      maxDxScore: input.game === "maimai" && typeof details.maxDxScore === "number" ? details.maxDxScore : null,
      track: typeof details.track === "number" ? details.track : null,
      metadata: details,
    }];
  });
  if (recents.length) await tx.insert(userRecentSongs).values(recents).onConflictDoNothing();
  const events = (input.fetched.events ?? []).map(event => {
    const metadata = event.metadata ?? {};
    const period = metadata.eventPeriod;
    return { game: input.game, snapshotId, name: event.name, metadata,
      eventType: input.game === "maimai" && (metadata.eventType === "area" || metadata.eventType === "eventArea") ? metadata.eventType : null,
      currentDistance: typeof metadata.currentDistance === "number" ? metadata.currentDistance : null,
      nextRewardDistance: typeof metadata.nextRewardDistance === "number" ? metadata.nextRewardDistance : null,
      state: input.game === "maimai" && (metadata.state === "not_started" || metadata.state === "in_progress" || metadata.state === "completed") ? metadata.state : null,
      imageUrl: typeof metadata.imageUrl === "string" ? metadata.imageUrl : null,
      eventPeriodStart: Array.isArray(period) && period[0] ? new Date(String(period[0])) : null,
      eventPeriodEnd: Array.isArray(period) && period[1] ? new Date(String(period[1])) : null,
    } satisfies typeof userEvents.$inferInsert;
  });
  if (events.length) await tx.insert(userEvents).values(events);
  if (input.game !== "maimai") {
    const albums = (input.fetched.albums ?? []).flatMap(album => {
      if (album.chart.game !== input.game || album.chart.region !== input.region || album.chart.version !== gameVersion) return [];
      const songId = chartResolution.get(`${album.chart.songName}|${album.chart.difficulty}|${album.chart.chartType}`);
      return songId === undefined ? [] : [{ game: input.game, userId: input.userId, songId, takenAt: album.capturedAt, metadata: album.metadata }];
    });
    if (albums.length) await tx.insert(userAlbums).values(albums);
  }
  if (input.deadline && Date.now() >= input.deadline) throw new Error("Fetch operation timed out before persistence completed");
  return { snapshotId, gameVersion, chartResolution };
  });
  if (input.persistExtra) {
    await input.persistExtra({
      userId: input.userId,
      region: input.region,
      sessionId: input.sessionId,
      snapshotId,
      gameVersion,
      chartResolution,
    }, input.backgroundWorkRef);
  }

  const { revalidatePublicProfileForUser } = await import("@/lib/profile-cache");
  await revalidatePublicProfileForUser(input.game, input.userId, [input.region]);

  return { snapshotId };
}

export type StartFetchResult = StartScoreFetchResult;
export type FetchStatusResult = ScoreFetchStatusResult;
