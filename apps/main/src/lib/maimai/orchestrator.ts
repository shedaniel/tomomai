import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { userTokens } from "../db/schema-pg";
import { FETCH_STATES } from "../fetch-states";
import { appendFetchState } from "../fetch-states-server";
import { fetchImageBuffer } from "@tomomai/server/image-converter";
import { logger } from "../logger";
import { getCurrentVersion } from "@tomomai/catalog/metadata";
import { decryptToken } from "../token-crypto";
import { Region } from "../types";
import {
  getCookiesFromRedirect,
  parseDivingFishToken,
  parseLxnsToken,
  processMaimaiToken,
  TokenValidationResult,
} from "@/server/services/maimai-login";
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
import { insertUserEvents } from "./events/persist";
import { extractPlayerData, fetchPlayerData } from "./player/fetch";
import { fetchLxnsPlayerData, LxnsAuthRevokedError } from "./player/lxns";
import { deleteToken } from "@/server/services/maimai-login";
import { createUserSnapshot } from "./player/persist";
import { fetchAndInsertRecentSongsData } from "./recents/details";
import { fetchRecentSongsData } from "./recents/fetch";
import { insertUserRecentSongs } from "./recents/persist";
import { fetchAllSongsData, fetchHiddenSongsData } from "./songs/fetch";
import { fetchLxnsScoresData } from "./songs/lxns";
import { buildSongLookupMaps, insertUserScores } from "./songs/persist";
import type {
  AlbumData,
  EventAreaData,
  EventData,
  PlayerData,
  RecentSongData,
  ScoreData,
} from "./types";

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
  flags: string[];
  validation: TokenValidationResult;
}

type DataFetcher = (ctx: FetcherContext) => Promise<FetchedMaimaiData>;

// ---------------------------------------------------------------------------
// Step 1: validate
// ---------------------------------------------------------------------------

async function validateRegionAccess(
  userId: string,
  region: Region,
): Promise<{ validation: TokenValidationResult; rawToken: string }> {
  const tokenRecord = await db.query.userTokens.findFirst({
    where: and(eq(userTokens.userId, userId), eq(userTokens.region, region)),
  });

  if (!tokenRecord) {
    throw new Error("No token found for this region. Please add your maimai token first.");
  }

  // Maintenance window: 4-7 AM JST
  const now = new Date();
  const jstHour = (now.getUTCHours() + 9) % 24;
  if (jstHour >= 4 && jstHour < 7) {
    throw new Error("Cannot fetch data during maintenance window (4AM - 7AM JST)");
  }

  const rawToken = decryptToken(tokenRecord.token);
  const validation = await processMaimaiToken(userId, region, rawToken);
  if (!validation.isValid) {
    throw new Error(validation.error || "Token validation failed");
  }

  logger.info("Token validation passed, proceeding with data fetch...");
  return { validation, rawToken };
}

// ---------------------------------------------------------------------------
// Step 2: fetch (region-specific)
// ---------------------------------------------------------------------------

const scrapeFetcher: DataFetcher = async ({ userId: _userId, region, sessionId, flags, validation }) => {
  if (!validation.redirectUrl) {
    throw new Error("No redirect URL received from token validation");
  }

  appendFetchState(sessionId, FETCH_STATES.LOGIN);

  const cookies = validation.cookiesReady && validation.cookies
    ? validation.cookies
    : await getCookiesFromRedirect(
      region,
      validation.redirectUrl,
      validation.cookies || null,
    );
  const playerDataHtml = await fetchPlayerData(region, cookies, validation.redirectUrl);

  logger.info("Starting player data extraction and songs data fetch...");
  const [playerData, allSongsData, recentSongsData, albumData] = await Promise.all([
    extractPlayerData(region, playerDataHtml, cookies).then((data) => {
      appendFetchState(sessionId, FETCH_STATES.PLAYER_DATA);
      return data;
    }),
    fetchAllSongsData(cookies, region, sessionId),
    fetchRecentSongsData(cookies, region, sessionId).then((data) => {
      appendFetchState(sessionId, FETCH_STATES.RECENT_SONGS);
      return data;
    }),
    region === "cn"
      ? Promise.resolve([] as AlbumData[]).then((data) => {
        appendFetchState(sessionId, FETCH_STATES.ALBUM_DATA);
        return data;
      })
      : fetchAlbumData(cookies, region).then((data) => {
        appendFetchState(sessionId, FETCH_STATES.ALBUM_DATA);
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
        logger.error(error, "Failed to fetch hidden songs data, continuing without hidden songs");
      }
    }
  } finally {
    appendFetchState(sessionId, FETCH_STATES.HIDDEN_SONGS);
  }

  let eventsData: FetchedMaimaiData["eventsData"] = null;
  if (flags.includes("eventsCard")) {
    try {
      logger.info("Fetching events data...");
      eventsData = await fetchEventsData(cookies, region, sessionId);
      logger.info("Events data fetched successfully");
    } catch (error) {
      logger.error(error, "Failed to fetch events data, continuing without events");
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

  appendFetchState(sessionId, FETCH_STATES.LOGIN);

  let playerData;
  let allSongsData: { [difficulty: number]: ScoreData[] };
  try {
    [playerData, allSongsData] = await Promise.all([
      fetchLxnsPlayerData(parsed.accessToken).then((data) => {
        appendFetchState(sessionId, FETCH_STATES.PLAYER_DATA);
        return data;
      }),
      fetchLxnsScoresData(parsed.accessToken),
    ]);
  } catch (error) {
    if (error instanceof LxnsAuthRevokedError) {
      logger.warn(`[lxns] auth revoked for user=${userId}, deleting token`);
      await deleteToken(userId, region);
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

  appendFetchState(sessionId, FETCH_STATES.LOGIN);

  let response;
  try {
    response = await fetchDivingFishRecordsByDevToken(parsed);
  } catch (error) {
    if (error instanceof DivingFishUserNotFoundError || error instanceof DivingFishPrivacyError) {
      logger.warn(`[divingfish] user inaccessible for user=${userId}, deleting token`);
      await deleteToken(userId, region);
      throw new Error("Session expired or invalid. Please provide a new token.");
    }
    if (error instanceof DivingFishAuthError) {
      logger.error({ error }, "[divingfish] dev token rejected by server");
      throw error;
    }
    throw error;
  }

  const playerData = parseDivingFishPlayerData(response);
  appendFetchState(sessionId, FETCH_STATES.PLAYER_DATA);
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

// ---------------------------------------------------------------------------
// Step 3: persist (foreground writes + background scheduling)
// ---------------------------------------------------------------------------

// Trivial composition: scrape image bytes and hand off to persistAlbumData.
async function fetchAndInsertAlbumData(
  userId: string,
  region: Region,
  cookies: string,
  albumData: AlbumData[],
): Promise<void> {
  await persistAlbumData(userId, region, albumData, (album) =>
    fetchImageBuffer(album.imageUrl, cookies),
  );
}

async function persistFetchedData(
  userId: string,
  region: Region,
  sessionId: bigint,
  fetched: FetchedMaimaiData,
  shouldFetchAlbums: boolean,
  backgroundWorkRef?: { promise: Promise<void> },
): Promise<void> {
  const snapshotId = await createUserSnapshot(userId, region, fetched.playerData);

  const gameVersion = getCurrentVersion(region);
  const { songLookup, fullSongMap } = await buildSongLookupMaps(region, gameVersion);

  logger.info("Starting user scores insertion...");
  await insertUserScores(snapshotId, region, sessionId, fetched.allSongsData, songLookup, fullSongMap);
  logger.info("User scores insertion completed");

  if (fetched.recentSongsData.length > 0) {
    logger.info("Starting user recent songs insertion...");
    await insertUserRecentSongs(userId, fetched.recentSongsData, songLookup);
    logger.info("User recent songs insertion completed");
  }

  if (fetched.eventsData) {
    logger.info("Starting user events insertion...");
    await insertUserEvents(snapshotId, fetched.eventsData.areaEvents, fetched.eventsData.eventAreaEvents);
    logger.info("User events insertion completed");
  }

  logger.info("Player data processed and snapshot created successfully");
  logger.info(`Session ID: ${sessionId}`);

  const backgroundTasks: Promise<void>[] = [];

  if (fetched.cookies && fetched.recentSongsData.length > 0) {
    logger.info("Starting detailed recent songs data fetch in background...");
    backgroundTasks.push(
      fetchAndInsertRecentSongsData(userId, region, fetched.cookies, fetched.recentSongsData).catch((error) => {
        logger.error(error, "Failed to fetch detailed recent songs data");
      }),
    );
  }

  if (fetched.cookies && shouldFetchAlbums && fetched.albumData.length > 0) {
    logger.info("Starting album data fetch in background...");
    backgroundTasks.push(
      fetchAndInsertAlbumData(userId, region, fetched.cookies, fetched.albumData).catch((error) => {
        logger.error(error, "Failed to fetch album data");
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

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function fetchMaimaiData(
  userId: string,
  region: Region,
  sessionId: bigint,
  flags: string[] = [],
  shouldFetchAlbums: boolean = false,
  backgroundWorkRef?: { promise: Promise<void> },
): Promise<void> {
  const { validation, rawToken } = await validateRegionAccess(userId, region);

  try {
    const fetcher = pickFetcher(region, rawToken);
    const fetched = await fetcher({ userId, region, sessionId, flags, validation });
    await persistFetchedData(userId, region, sessionId, fetched, shouldFetchAlbums, backgroundWorkRef);
  } catch (error) {
    logger.error(error, "Error during maimai data fetch");
    throw error;
  }
}
