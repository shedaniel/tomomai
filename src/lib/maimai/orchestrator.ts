import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { userTokens } from "../db/schema-pg";
import { FETCH_STATES } from "../fetch-states";
import { appendFetchState } from "../fetch-states-server";
import { fetchImageBuffer } from "../image-converter";
import { logger } from "../logger";
import { getCurrentVersion } from "../metadata";
import { decryptToken } from "../token-crypto";
import { Region } from "../types";
import { getCookiesFromRedirect, processMaimaiToken } from "@/server/services/maimai-login";
import { persistAlbumData } from "./albums/persist";
import { fetchAlbumData } from "./albums/fetch";
import { fetchEventsData } from "./events/fetch";
import { insertUserEvents } from "./events/persist";
import { extractPlayerData, fetchPlayerData } from "./player/fetch";
import { createUserSnapshot } from "./player/persist";
import { fetchAndInsertRecentSongsData } from "./recents/details";
import { fetchRecentSongsData } from "./recents/fetch";
import { insertUserRecentSongs } from "./recents/persist";
import { fetchAllSongsData, fetchHiddenSongsData } from "./songs/fetch";
import { buildSongLookupMaps, insertUserScores } from "./songs/persist";
import type { AlbumData } from "./types";

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

export async function fetchMaimaiData(
  userId: string,
  region: Region,
  sessionId: bigint,
  flags: string[] = [],
  shouldFetchAlbums: boolean = false,
  backgroundWorkRef?: { promise: Promise<void> },
): Promise<void> {
  const tokenRecord = await db.query.userTokens.findFirst({
    where: and(
      eq(userTokens.userId, userId),
      eq(userTokens.region, region),
    ),
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

  const validation = await processMaimaiToken(userId, region, decryptToken(tokenRecord.token));

  if (!validation.isValid) {
    throw new Error(validation.error || "Token validation failed");
  }

  logger.info("Token validation passed, proceeding with data fetch...");

  if (!validation.redirectUrl) {
    throw new Error("No redirect URL received from token validation");
  }

  try {
    appendFetchState(sessionId, FETCH_STATES.LOGIN);

    const cookies = await getCookiesFromRedirect(region, validation.redirectUrl, validation.cookies || null);
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
      fetchAlbumData(cookies, region).then((data) => {
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

    let eventsData: Awaited<ReturnType<typeof fetchEventsData>> | null = null;

    if (flags.includes("eventsCard")) {
      try {
        logger.info("Fetching events data...");
        eventsData = await fetchEventsData(cookies, region, sessionId);
        logger.info("Events data fetched successfully");
      } catch (error) {
        logger.error(error, "Failed to fetch events data, continuing without events");
      }
    }

    const snapshotId = await createUserSnapshot(userId, region, playerData);

    const gameVersion = getCurrentVersion(region);
    const { songLookup, fullSongMap } = await buildSongLookupMaps(region, gameVersion);

    logger.info("Starting user scores insertion...");
    await insertUserScores(snapshotId, region, sessionId, allSongsData, songLookup, fullSongMap);
    logger.info("User scores insertion completed");

    if (recentSongsData.length > 0) {
      logger.info("Starting user recent songs insertion...");
      await insertUserRecentSongs(userId, recentSongsData, songLookup);
      logger.info("User recent songs insertion completed");
    }

    if (eventsData) {
      logger.info("Starting user events insertion...");
      await insertUserEvents(snapshotId, eventsData.areaEvents, eventsData.eventAreaEvents);
      logger.info("User events insertion completed");
    }

    logger.info("Player data processed and snapshot created successfully");
    logger.info(`Session ID: ${sessionId}`);

    const backgroundTasks: Promise<void>[] = [];

    if (recentSongsData.length > 0) {
      logger.info("Starting detailed recent songs data fetch in background...");
      backgroundTasks.push(
        fetchAndInsertRecentSongsData(userId, region, cookies, recentSongsData).catch((error) => {
          logger.error(error, "Failed to fetch detailed recent songs data");
        }),
      );
    }

    if (shouldFetchAlbums && albumData.length > 0) {
      logger.info("Starting album data fetch in background...");
      backgroundTasks.push(
        fetchAndInsertAlbumData(userId, region, cookies, albumData).catch((error) => {
          logger.error(error, "Failed to fetch album data");
        }),
      );
    } else if (!shouldFetchAlbums && albumData.length > 0) {
      logger.info(`Skipping album fetch: user opted out (found ${albumData.length} albums)`);
    }

    const bgWork = Promise.allSettled(backgroundTasks).then(() => { });
    if (backgroundWorkRef) {
      backgroundWorkRef.promise = bgWork;
    }

  } catch (error) {
    logger.error(error, "Error during maimai data fetch");
    throw error;
  }
}
