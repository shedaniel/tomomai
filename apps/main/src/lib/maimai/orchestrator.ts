import { FETCH_STATES } from "../fetch-states";
import { appendFetchState } from "../fetch-states-server";
import { fetchImageBuffer } from "../image-converter";
import { logger } from "../logger";
import { getLogger } from "../request-logger";
import { Region } from "../types";
import {
  parseDivingFishToken,
  parseLxnsToken,
  processMaimaiToken,
} from "@/server/services/games/maimai/login";
import type { TokenValidationResult } from "@/server/services/games/sega/login";
import { getCookiesFromRedirect } from "@/server/services/games/sega/http";
import {
  DivingFishAuthError,
  DivingFishPrivacyError,
  DivingFishUserNotFoundError,
  fetchDivingFishRecordsByDevToken,
} from "./divingfish/client";
import { parseDivingFishPlayerData } from "./player/divingfish-parse";
import { parseDivingFishScoresData } from "./songs/divingfish-parse";
import { persistAlbumData } from "./albums/persist";
import { fetchAlbumData } from "./albums/fetch";
import { fetchEventsData } from "./events/fetch";
import { extractPlayerData, fetchPlayerData } from "./player/fetch";
import { fetchLxnsPlayerData, LxnsAuthRevokedError } from "./player/lxns";
import { deleteToken } from "@/server/services/games/tokens";
import { fetchAndInsertRecentSongsData } from "./recents/details";
import { fetchRecentSongsData } from "./recents/fetch";
import { fetchAllSongsData, fetchHiddenSongsData } from "./songs/fetch";
import { fetchLxnsScoresData } from "./songs/lxns";
import type {
  AlbumData,
  EventAreaData,
  EventData,
  PlayerData,
  RecentSongData,
  ScoreData,
} from "./types";
import type { Flags } from "../flags";
import type { PersistedSnapshotContext, ScoreFetchContext } from "@/lib/games/types";

// ---------------------------------------------------------------------------
// Shared fetcher contract
// ---------------------------------------------------------------------------

export interface FetchedMaimaiData {
  playerData: PlayerData;
  allSongsData: { [difficulty: number]: ScoreData[] };
  recentSongsData: RecentSongData[];
  albumData: AlbumData[];
  eventsData: { areaEvents: EventData[]; eventAreaEvents: EventAreaData[] } | null;
  // Optional follow-up handles used by background tasks. Only populated by
  // scrape-based fetchers (intl/jp) — the CN fetcher relies on REST APIs and
  // doesn't need cookies for image follow-ups.
  cookies?: string;
}

interface FetcherContext {
  userId: string;
  region: Region;
  sessionId: bigint;
  flags: Flags;
  validation: TokenValidationResult;
}

type DataFetcher = (ctx: FetcherContext) => Promise<FetchedMaimaiData>;

// ---------------------------------------------------------------------------
// Step 1: validate
// ---------------------------------------------------------------------------

async function validateRegionAccess(
  userId: string,
  region: Region,
  rawToken: string,
  signal: AbortSignal,
): Promise<{ validation: TokenValidationResult; rawToken: string }> {
  const validation = await processMaimaiToken(userId, region, rawToken, signal);
  if (!validation.isValid) {
    throw new Error(validation.error || "Token validation failed");
  }

  logger.info("Token validation passed, proceeding with data fetch...");
  return { validation, rawToken };
}

// ---------------------------------------------------------------------------
// Step 2: fetch (region-specific)
// ---------------------------------------------------------------------------

const scrapeFetcher: DataFetcher = async ({ region, sessionId, flags, validation }) => {
  if (!validation.redirectUrl) {
    throw new Error("No redirect URL received from token validation");
  }

  appendFetchState(sessionId, FETCH_STATES.LOGIN, "maimai");

  const cookies = validation.cookiesReady && validation.cookies
    ? validation.cookies
    : await getCookiesFromRedirect(
      "maimai",
      region,
      validation.redirectUrl,
      validation.cookies || null,
    );
  const playerDataHtml = await fetchPlayerData(region, cookies, validation.redirectUrl);

  logger.info("Starting player data extraction and songs data fetch...");
  const [playerData, allSongsData, recentSongsData, albumData] = await Promise.all([
    extractPlayerData(region, playerDataHtml, cookies).then((data) => {
      appendFetchState(sessionId, FETCH_STATES.PLAYER_DATA, "maimai");
      return data;
    }),
    fetchAllSongsData(cookies, region, sessionId),
    fetchRecentSongsData(cookies, region, sessionId).then((data) => {
      appendFetchState(sessionId, FETCH_STATES.RECENT_SONGS, "maimai");
      return data;
    }),
    region === "cn"
      ? Promise.resolve([] as AlbumData[]).then((data) => {
        appendFetchState(sessionId, FETCH_STATES.ALBUM_DATA, "maimai");
        return data;
      })
      : fetchAlbumData(cookies, region).then((data) => {
        appendFetchState(sessionId, FETCH_STATES.ALBUM_DATA, "maimai");
        return data;
      }),
  ]);
  logger.info("Player data extraction and songs data fetch completed");

  try {
    if (region === "intl") {
      try {
        logger.info("Fetching hidden songs data for intl region...");
        const hiddenSongs = await fetchHiddenSongsData(cookies, allSongsData);
        for (const hiddenSong of hiddenSongs) {
          const difficulty = hiddenSong.difficultyNumber;
          if (!allSongsData[difficulty]) {
            allSongsData[difficulty] = [];
          }
          allSongsData[difficulty].push(hiddenSong);
        }
        logger.info(`Added ${hiddenSongs.length} hidden songs to songs data`);
      } catch (error) {
        logger.error({ err: error }, "Failed to fetch hidden songs data, continuing without hidden songs");
      }
    }
  } finally {
    appendFetchState(sessionId, FETCH_STATES.HIDDEN_SONGS, "maimai");
  }

  let eventsData: FetchedMaimaiData["eventsData"] = null;
  if (flags.eventsCard) {
    try {
      logger.info("Fetching events data...");
      eventsData = await fetchEventsData(cookies, region);
      logger.info("Events data fetched successfully");
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch events data, continuing without events");
    }
  }

  return { playerData, allSongsData, recentSongsData, albumData, eventsData, cookies };
};

const lxnsFetcher: DataFetcher = async ({ userId, region, sessionId, validation }) => {
  if (region !== "cn") {
    throw new Error(`lxns fetcher is only supported for CN region (got ${region})`);
  }
  if (!validation.token) {
    throw new Error("lxns validation result is missing token");
  }
  const parsed = parseLxnsToken(validation.token);
  if (!parsed) {
    throw new Error("Failed to parse lxns token");
  }

  appendFetchState(sessionId, FETCH_STATES.LOGIN, "maimai");

  let playerData;
  let allSongsData: { [difficulty: number]: ScoreData[] };
  try {
    [playerData, allSongsData] = await Promise.all([
      fetchLxnsPlayerData(parsed.accessToken).then((data) => {
        appendFetchState(sessionId, FETCH_STATES.PLAYER_DATA, "maimai");
        return data;
      }),
      fetchLxnsScoresData(parsed.accessToken),
    ]);
  } catch (error) {
    if (error instanceof LxnsAuthRevokedError) {
      logger.warn(`[lxns] auth revoked for user=${userId}, deleting token`);
      await deleteToken("maimai", userId, region);
      throw new Error("Session expired or invalid. Please provide a new token.");
    }
    throw error;
  }

  // Recents / albums / events: not yet implemented for lxns.
  return {
    playerData,
    allSongsData,
    recentSongsData: [],
    albumData: [],
    eventsData: null,
  };
};

const divingfishFetcher: DataFetcher = async ({ userId, region, sessionId, validation }) => {
  if (region !== "cn") {
    throw new Error(`divingfish fetcher is only supported for CN region (got ${region})`);
  }
  if (!validation.token) {
    throw new Error("divingfish validation result is missing token");
  }
  const parsed = parseDivingFishToken(validation.token);
  if (!parsed) {
    throw new Error("Failed to parse divingfish token");
  }

  appendFetchState(sessionId, FETCH_STATES.LOGIN, "maimai");

  let response;
  try {
    response = await fetchDivingFishRecordsByDevToken(parsed);
  } catch (error) {
    if (error instanceof DivingFishUserNotFoundError || error instanceof DivingFishPrivacyError) {
      logger.warn(`[divingfish] user inaccessible for user=${userId}, deleting token`);
      await deleteToken("maimai", userId, region);
      throw new Error("Session expired or invalid. Please provide a new token.");
    }
    if (error instanceof DivingFishAuthError) {
      logger.error({ err: error }, "[divingfish] dev token rejected by server");
      throw error;
    }
    throw error;
  }

  const playerData = parseDivingFishPlayerData(response);
  appendFetchState(sessionId, FETCH_STATES.PLAYER_DATA, "maimai");
  const allSongsData = parseDivingFishScoresData(response.records);

  return {
    playerData,
    allSongsData,
    recentSongsData: [],
    albumData: [],
    eventsData: null,
  };
};

function pickFetcher(region: Region, rawToken: string): DataFetcher {
  if (rawToken.startsWith("cookie://") || rawToken.startsWith("account://")) {
    return scrapeFetcher;
  }
  if (rawToken.startsWith("cn-cookies://")) {
    if (region !== "cn") {
      throw new Error(`cn-cookies:// token is only valid for CN region (got ${region})`);
    }
    return scrapeFetcher;
  }
  if (rawToken.startsWith("lxns://")) {
    if (region !== "cn") {
      throw new Error(`lxns:// token is only valid for CN region (got ${region})`);
    }
    return lxnsFetcher;
  }
  if (rawToken.startsWith("divingfish://")) {
    if (region !== "cn") {
      throw new Error(`divingfish:// token is only valid for CN region (got ${region})`);
    }
    return divingfishFetcher;
  }
  throw new Error(`Unsupported token provider for region ${region}`);
}

export async function runMaimaiFetcher(ctx: ScoreFetchContext): Promise<{ fetched: FetchedMaimaiData; validation: TokenValidationResult }> {
  const { validation, rawToken } = await validateRegionAccess(ctx.userId, ctx.region, ctx.token, ctx.signal);
  ctx.signal.throwIfAborted();

  try {
    const fetcher = pickFetcher(ctx.region, rawToken);
    const fetched = await fetcher({ ...ctx, validation });
    return { fetched, validation };
  } catch (error) {
    getLogger().error({ err: error }, "Error during maimai data fetch");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Maimai-specific extras (common snapshot persistence happens elsewhere)
// ---------------------------------------------------------------------------

export async function persistMaimaiExtra(
  ctx: PersistedSnapshotContext,
  fetched: FetchedMaimaiData,
  shouldFetchAlbums: boolean,
  backgroundWorkRef?: { promise: Promise<void> },
): Promise<void> {
  const backgroundTasks: Promise<void>[] = [];

  if (fetched.cookies && fetched.recentSongsData.length > 0) {
    logger.info("Starting detailed recent songs data fetch in background...");
    backgroundTasks.push(
      fetchAndInsertRecentSongsData(ctx.userId, ctx.region, fetched.cookies, fetched.recentSongsData).catch((error) => {
        logger.error({ err: error }, "Failed to fetch detailed recent songs data");
      }),
    );
  }

  if (fetched.cookies && shouldFetchAlbums && fetched.albumData.length > 0) {
    logger.info("Starting album data fetch in background...");
    backgroundTasks.push(
      persistAlbumData(ctx.userId, ctx.chartResolution, fetched.albumData, album => fetchImageBuffer(album.imageUrl, fetched.cookies!)).catch((error) => {
        logger.error({ err: error }, "Failed to fetch album data");
      }),
    );
  } else if (!shouldFetchAlbums && fetched.albumData.length > 0) {
    logger.info(`Skipping album fetch: user opted out (found ${fetched.albumData.length} albums)`);
  }

  const bgWork = Promise.allSettled(backgroundTasks).then(() => { });
  if (backgroundWorkRef) {
    backgroundWorkRef.promise = bgWork;
  }
}
