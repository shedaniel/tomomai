import "server-only";
import { FETCH_STATES } from "@/lib/fetch-states";
import { appendFetchState } from "@/lib/fetch-states-server";
import { logger } from "@/lib/logger";
import { getLogger } from "@/lib/request-logger";
import { Region } from "@/lib/types";
import { openMaimaiLogin } from "../login";
import { openGameSite } from "@/server/services/games/sega/http";
import {
  DivingFishAuthError,
  DivingFishPrivacyError,
  DivingFishUserNotFoundError,
  fetchDivingFishRecordsByDevToken,
  type DivingFishIdentifier,
} from "./divingfish/client";
import { parseDivingFishPlayerData } from "./player/divingfish-parse";
import { parseDivingFishScoresData } from "./songs/divingfish-parse";
import { persistAlbumData } from "./albums/persist";
import { fetchAlbumData } from "./albums/fetch";
import { fetchEventsData } from "./events/fetch";
import { extractPlayerData } from "./player/fetch";
import { fetchLxnsPlayerData, LxnsAuthRevokedError } from "./player/lxns";
import { deleteToken } from "@/server/services/games/tokens";
import { fetchAndInsertRecentSongsData } from "./recents/details";
import { fetchRecentSongsData } from "./recents/fetch";
import { fetchAllSongsData, fetchHiddenSongsData } from "./songs/fetch";
import { fetchLxnsScoresData } from "./songs/lxns";
import { assertMaimaiPage } from "./parse-utils";
import type { AlbumData, FetchedMaimaiData, ScoreData } from "./types";
import type { Flags } from "@/lib/flags";
import type { PersistedSnapshotContext, ScoreFetchContext } from "@/server/services/games/types";

interface FetcherContext {
  userId: string;
  region: Region;
  sessionId: bigint;
  flags: Flags;
  signal: AbortSignal;
}

async function scrapeFetcher({ region, sessionId, flags, signal }: FetcherContext, cookies: string): Promise<FetchedMaimaiData> {
  appendFetchState(sessionId, FETCH_STATES.LOGIN, "maimai");

  const site = openGameSite("maimai", region, { cookies }, { signal, assertPage: assertMaimaiPage });
  const playerDataHtml = await site.html("playerData/");

  logger.info("Starting player data extraction and songs data fetch...");
  const [playerData, allSongsData, recentSongsData, albumData] = await Promise.all([
    extractPlayerData(site, region, playerDataHtml, signal).then((data) => {
      appendFetchState(sessionId, FETCH_STATES.PLAYER_DATA, "maimai");
      return data;
    }),
    fetchAllSongsData(site, sessionId),
    fetchRecentSongsData(site).then((data) => {
      appendFetchState(sessionId, FETCH_STATES.RECENT_SONGS, "maimai");
      return data;
    }),
    region === "cn"
      ? Promise.resolve([] as AlbumData[]).then((data) => {
        appendFetchState(sessionId, FETCH_STATES.ALBUM_DATA, "maimai");
        return data;
      })
      : fetchAlbumData(site, region).then((data) => {
        appendFetchState(sessionId, FETCH_STATES.ALBUM_DATA, "maimai");
        return data;
      }),
  ]);
  logger.info("Player data extraction and songs data fetch completed");

  try {
    if (region === "intl") {
      try {
        logger.info("Fetching hidden songs data for intl region...");
        const hiddenSongs = await fetchHiddenSongsData(site, allSongsData);
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
      eventsData = await fetchEventsData(site, region);
      logger.info("Events data fetched successfully");
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch events data, continuing without events");
    }
  }

  return { playerData, allSongsData, recentSongsData, albumData, eventsData, site };
}

async function lxnsFetcher({ userId, region, sessionId, signal }: FetcherContext, accessToken: string): Promise<FetchedMaimaiData> {
  appendFetchState(sessionId, FETCH_STATES.LOGIN, "maimai");

  let playerData;
  let allSongsData: { [difficulty: number]: ScoreData[] };
  try {
    [playerData, allSongsData] = await Promise.all([
      fetchLxnsPlayerData(accessToken, signal).then((data) => {
        appendFetchState(sessionId, FETCH_STATES.PLAYER_DATA, "maimai");
        return data;
      }),
      fetchLxnsScoresData(accessToken, signal),
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
}

async function divingfishFetcher({ userId, region, sessionId }: FetcherContext, account: DivingFishIdentifier): Promise<FetchedMaimaiData> {
  appendFetchState(sessionId, FETCH_STATES.LOGIN, "maimai");

  let response;
  try {
    response = await fetchDivingFishRecordsByDevToken(account);
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
}

export async function runMaimaiFetcher(ctx: ScoreFetchContext): Promise<FetchedMaimaiData> {
  const login = await openMaimaiLogin(ctx.userId, ctx.region, ctx.token, ctx.signal);
  ctx.signal.throwIfAborted();

  try {
    switch (login.kind) {
      case "site-session":
        return await scrapeFetcher(ctx, login.cookies);
      case "lxns":
        return await lxnsFetcher(ctx, login.accessToken);
      case "divingfish":
        return await divingfishFetcher(ctx, login.account);
    }
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

  const { site } = fetched;
  if (site && fetched.recentSongsData.length > 0) {
    logger.info("Starting detailed recent songs data fetch in background...");
    backgroundTasks.push(
      fetchAndInsertRecentSongsData(ctx.userId, ctx.region, site, fetched.recentSongsData).catch((error) => {
        logger.error({ err: error }, "Failed to fetch detailed recent songs data");
      }),
    );
  }

  if (site && shouldFetchAlbums && fetched.albumData.length > 0) {
    logger.info("Starting album data fetch in background...");
    backgroundTasks.push(
      persistAlbumData(ctx.userId, ctx.chartResolution, fetched.albumData, async album => (await site.bytes(album.imageUrl)).buffer).catch((error) => {
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
