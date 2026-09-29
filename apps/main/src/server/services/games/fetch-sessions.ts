import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { after } from "next/server";
import type { Logger } from "pino";
import { z } from "zod";
import { db } from "@/lib/db";
import { fetchSessions, user } from "@/lib/db/schema-pg";
import { appendFetchState } from "@/lib/fetch-states-server";
import { resolveFlagsForUser, type Flags } from "@/lib/flags";
import { resolveGameContext } from "@/lib/games/access";
import { offersCapability } from "@/lib/games/capabilities";
import { getGameMaintenance, getGameMaintenanceError } from "@/lib/games/maintenance";
import { getGame } from "@/lib/games/registry";
import type { CanonicalGameId } from "@/lib/games/types";
import { getCurrentVersion } from "@/lib/games/versions";
import { flushLogger } from "@/lib/logger";
import { revalidatePublicProfileForUser } from "@/lib/profile-cache";
import { getLogger } from "@/lib/request-logger";
import type { Region } from "@/lib/types";
import { FetchStartError } from "./fetch-errors";
import { createFetchRun, fetchFailure } from "./fetch-run";
import { GAME_SERVER_MODULES } from "./registry";
import { notFoundScoreSchema, persistFetchResult, type NotFoundScore } from "./snapshot-persistence";
import { readToken, saveToken } from "./tokens";
import type { Enrichment, PersistedSnapshotContext, ScoreFetchContext } from "./types";

const MINUTE_MS = 60 * 1000;
const FETCH_TIMEOUT_MINUTES = 2;
const STALE_SESSION_MINUTES = 3;
const RATE_LIMIT = { fetches: 5, windowMinutes: 5 };

type StartScoreFetchResult = {
  sessionId: string;
  status: "pending";
  backgroundWork?: Promise<void>;
};

type ScoreFetchStatusResult = {
  id: string;
  status: "pending" | "completed" | "failed";
  startedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
  statusStates: string | null;
  notFoundScores: NotFoundScore[] | null;
};

const sessionExtraDataSchema = z.object({ notFoundScores: z.array(notFoundScoreSchema) });
type SessionExtraData = z.infer<typeof sessionExtraDataSchema>;

type SessionOutcome =
  | { status: "completed"; extraData?: SessionExtraData }
  | { status: "failed"; errorMessage: string };

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error occurred";
}

async function openSession(userId: string, game: CanonicalGameId, region: Region): Promise<{ id: bigint; publicId: string }> {
  const publicId = nanoid();
  const [{ id }] = await db.insert(fetchSessions).values({
    publicId,
    userId,
    game,
    region,
    status: "pending",
    startedAt: new Date(),
  }).returning({ id: fetchSessions.id });
  return { id, publicId };
}

async function markSession(id: bigint, outcome: SessionOutcome): Promise<void> {
  await db.update(fetchSessions).set({ ...outcome, completedAt: new Date() }).where(eq(fetchSessions.id, id));
}

// Legacy rows stored the report as a JSON string, which Drizzle's jsonb mapping decodes on read.
function parseNotFoundScores(extraData: unknown): NotFoundScore[] | null {
  const parsed = sessionExtraDataSchema.safeParse(extraData);
  return parsed.success ? parsed.data.notFoundScores : null;
}

async function demoScoreFetch(userId: string, game: CanonicalGameId, region: Region): Promise<StartScoreFetchResult> {
  const session = await openSession(userId, game, region);
  void (async () => {
    try {
      for (const state of getGame(game).fetchStages) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await appendFetchState(session.id, state);
      }
      await markSession(session.id, { status: "completed" });
    } catch (err) {
      getLogger().error({ err, game, region }, "Error during demo score fetch");
      await markSession(session.id, { status: "failed", errorMessage: failureMessage(err) });
    }
  })();
  return { sessionId: session.publicId, status: "pending" };
}

async function shouldFetchAlbums(userId: string, game: CanonicalGameId, region: Region): Promise<boolean> {
  if (!offersCapability(getGame(game), "albums", region)) return false;
  const [preference] = await db
    .select({ fetchUseAlbums: user.fetchUseAlbums })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!preference || preference.fetchUseAlbums === null) {
    throw new FetchStartError("NO_USE_ALBUMS_SETTINGS", "No fetch albums settings preference set. Please set this option on the website by fetching once first.");
  }
  return preference.fetchUseAlbums;
}

/** Fails sessions left pending too long, then refuses a fetch while another runs or once the rate limit is reached. */
async function admitFetch(userId: string, game: CanonicalGameId, region: Region): Promise<void> {
  const sameFetches = and(eq(fetchSessions.userId, userId), eq(fetchSessions.game, game), eq(fetchSessions.region, region));
  const now = Date.now();

  const pending = await db.select().from(fetchSessions).where(and(sameFetches, eq(fetchSessions.status, "pending")));
  let running = false;
  for (const session of pending) {
    if (now - session.startedAt.getTime() > STALE_SESSION_MINUTES * MINUTE_MS) {
      await markSession(session.id, { status: "failed", errorMessage: `Fetch timed out after ${STALE_SESSION_MINUTES} minutes` });
    } else {
      running = true;
    }
  }
  if (running) throw new FetchStartError("FETCH_IN_PROGRESS", "A fetch is already in progress for this region");

  const recent = await db
    .select()
    .from(fetchSessions)
    .where(sameFetches)
    .orderBy(desc(fetchSessions.startedAt))
    .limit(RATE_LIMIT.fetches);
  if (recent.length < RATE_LIMIT.fetches) return;
  const remainingMs = RATE_LIMIT.windowMinutes * MINUTE_MS - (now - recent[RATE_LIMIT.fetches - 1].startedAt.getTime());
  if (remainingMs > 0) {
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    throw new FetchStartError(
      "RATE_LIMITED",
      `You can make ${RATE_LIMIT.fetches} requests per ${RATE_LIMIT.windowMinutes} minutes. Try again in ${remainingSeconds} seconds.`,
      remainingSeconds,
    );
  }
}

export async function startScoreFetch(input: {
  userId: string;
  game: CanonicalGameId;
  region: Region;
  token?: string;
  flags?: Flags;
  options?: { skipAfter?: boolean };
}): Promise<StartScoreFetchResult> {
  const { game, region } = resolveGameContext(input.game, { region: input.region, capability: "scores" });
  const { userId } = input;
  const scoreSource = GAME_SERVER_MODULES[game].scores;

  if (process.env.DEMO_FETCH === "true") return demoScoreFetch(userId, game, region);

  const token = input.token || await readToken(game, userId, region);
  if (!token) {
    throw new FetchStartError("NO_TOKEN_FOUND", "No authentication token found. Please add your authentication token first.");
  }
  if (input.token) {
    await saveToken(game, userId, region, token);
  } else {
    const refusal = scoreSource.rejectStoredToken?.(token);
    if (refusal) throw refusal;
  }

  // After saving, so a token submitted during maintenance is kept for the next fetch.
  const maintenance = getGameMaintenance(game, region);
  if (maintenance?.active) {
    const retryAfterSeconds = Math.ceil((maintenance.endsAt.getTime() - Date.now()) / 1000);
    throw new FetchStartError("MAINTENANCE", getGameMaintenanceError(maintenance), retryAfterSeconds);
  }

  const gameVersion = getCurrentVersion(game, region);
  const flags = input.flags ?? await resolveFlagsForUser(userId);
  const fetchAlbums = await shouldFetchAlbums(userId, game, region);
  await admitFetch(userId, game, region);

  const session = await openSession(userId, game, region);
  const controller = new AbortController();
  const work = () => runScoreFetch({
    game, userId, region, sessionId: session.id, gameVersion, flags, token, shouldFetchAlbums: fetchAlbums, signal: controller.signal,
  }, controller);

  const result: StartScoreFetchResult = { sessionId: session.publicId, status: "pending" };
  if (input.options?.skipAfter) {
    result.backgroundWork = work();
  } else {
    after(work);
  }
  return result;
}

async function runScoreFetch(ctx: ScoreFetchContext, controller: AbortController): Promise<void> {
  const run = createFetchRun(ctx);
  let enrichment: Promise<void> | undefined;
  try {
    let saved: { context: PersistedSnapshotContext; enrich?: Enrichment };
    try {
      const deadline = Date.now() + FETCH_TIMEOUT_MINUTES * MINUTE_MS;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const { result, enrich } = await Promise.race([
        GAME_SERVER_MODULES[ctx.game].scores.fetch(ctx, run),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error(`Fetch operation timed out after ${FETCH_TIMEOUT_MINUTES} minutes`);
            controller.abort(error);
            reject(error);
          }, FETCH_TIMEOUT_MINUTES * MINUTE_MS);
        }),
      ]).finally(() => clearTimeout(timer));
      const { context, notFoundScores } = await persistFetchResult({
        game: ctx.game, region: ctx.region, userId: ctx.userId, sessionId: ctx.sessionId, gameVersion: ctx.gameVersion, fetched: result, deadline,
      });
      await markSession(ctx.sessionId, { status: "completed", extraData: notFoundScores.length > 0 ? { notFoundScores } : undefined });
      saved = { context, enrich };
    } catch (error) {
      // Stops the stages still running beside the one that failed.
      controller.abort(error);
      const failure = fetchFailure(error);
      run.log.error(failure, "Error during score fetch");
      await markSession(ctx.sessionId, { status: "failed", errorMessage: failureMessage(failure.err) });
      return;
    }

    // The snapshot is saved and its session completed, so later failures are only logged.
    try {
      if (saved.enrich) enrichment = enrichSnapshot(saved.enrich, saved.context, run.log);
      await revalidatePublicProfileForUser(ctx.game, ctx.userId, [ctx.region]);
    } catch (err) {
      run.log.error({ err }, "Failed to revalidate the public profile after a fetch");
    }
  } finally {
    await enrichment;
    await flushLogger();
  }
}

async function enrichSnapshot(enrich: Enrichment, context: PersistedSnapshotContext, log: Logger): Promise<void> {
  try {
    await enrich(context);
  } catch (err) {
    log.error({ err, stepType: "enrich" }, "Score fetch enrichment failed");
  }
}

export async function getScoreFetchStatus(input: {
  userId: string;
  game: CanonicalGameId;
  region: Region;
}): Promise<ScoreFetchStatusResult | null> {
  const [session] = await db
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
  if (!session) return null;

  const { extraData, ...status } = session;
  return { ...status, notFoundScores: parseNotFoundScores(extraData) };
}
