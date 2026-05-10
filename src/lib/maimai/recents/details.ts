import { load } from "cheerio";
import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { userRecentSongs, userRecentSongsDetailed } from "../../db/schema-pg";
import { logger } from "../../logger";
import { Region } from "../../types";
import { maimaiBaseUrl, maimaiGet } from "../http";
import type { RecentSongData } from "../types";

// Fetches per-play playlog detail pages and writes the enriched per-note
// breakdown into userRecentSongsDetailed. Scrape-only.
export async function fetchAndInsertRecentSongsData(
  userId: string,
  region: Region,
  cookies: string,
  recentSongsData: RecentSongData[],
): Promise<void> {
  logger.info(`Starting detailed recent songs data fetch for user ${userId}, ${recentSongsData.length} records`);

  if (recentSongsData.length === 0) {
    logger.debug("No recent songs to fetch details for");
    return;
  }

  const existingValid = await db
    .select({ playedAt: userRecentSongs.playedAt })
    .from(userRecentSongsDetailed)
    .innerJoin(userRecentSongs, eq(userRecentSongs.id, userRecentSongsDetailed.recentSongId))
    .where(and(
      eq(userRecentSongs.userId, userId),
      inArray(userRecentSongs.playedAt, recentSongsData.map(r => r.playedAt)),
      gt(userRecentSongsDetailed.maxCombo, 0),
    ));
  const existingPlayedAts = new Set(existingValid.map(r => r.playedAt.getTime()));
  const toFetch = recentSongsData.filter(r => !existingPlayedAts.has(r.playedAt.getTime()));
  const skipped = recentSongsData.length - toFetch.length;
  if (skipped > 0) {
    logger.info(`Skipping ${skipped} recent songs already having detailed rows; fetching ${toFetch.length}`);
  }
  if (toFetch.length === 0) {
    logger.debug("All recent songs already have detailed rows; nothing to fetch");
    return;
  }

  const baseUrl = maimaiBaseUrl(region);
  const playlogDetailUrl = `${baseUrl}/maimai-mobile/record/playlogDetail/`;

  const BATCH_SIZE = 6;
  for (let batchStart = 0; batchStart < toFetch.length; batchStart += BATCH_SIZE) {
    const batch = toFetch.slice(batchStart, batchStart + BATCH_SIZE);
    logger.debug(`Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: ${batch.length} records`);

    const detailPromises = batch.map(async (recentSong) => {
      try {
        const detailUrl = `${playlogDetailUrl}?idx=${encodeURIComponent(recentSong.idx)}`;

        let html: string;
        try {
          const response = await maimaiGet(detailUrl, cookies, `${baseUrl}/maimai-mobile/record/`);
          html = await response.text();
        } catch (err) {
          logger.warn(`Failed to fetch playlog detail for idx ${recentSong.idx}: ${err instanceof Error ? err.message : err}`);
          return null;
        }

        const $ = load(html);

        const flBlocks = $(".playlog_fl_block > * .p_t_5");
        const fastCount = flBlocks.length > 0 ? parseInt(flBlocks.eq(0).text().trim().replace(/,/g, ''), 10) || 0 : 0;
        const lateCount = flBlocks.length > 1 ? parseInt(flBlocks.eq(1).text().trim().replace(/,/g, ''), 10) || 0 : 0;

        const scoreBlocks = $(".playlog_score_block > div.white");
        const comboText = scoreBlocks.length > 1 ? scoreBlocks.eq(1).text().trim() : "";
        const comboMatch = comboText.match(/(\d+(?:,\d+)?)\s*\/\s*(\d+(?:,\d+)?)/);
        if (!comboMatch) {
          logger.warn(`Playlog detail parse failed (no combo) for idx ${recentSong.idx}`);
          return null;
        }
        const combo = parseInt(comboMatch[1].replace(/,/g, ''), 10);
        const maxCombo = parseInt(comboMatch[2].replace(/,/g, ''), 10);

        const syncScoreText = scoreBlocks.length > 2 ? scoreBlocks.eq(2).text().trim() : "";
        let syncScore: number | null = null;
        let maxSyncScore: number | null = null;
        if (syncScoreText.includes('/')) {
          const syncMatch = syncScoreText.match(/(\d+(?:,\d+)?)\s*\/\s*(\d+(?:,\d+)?)/);
          if (syncMatch) {
            syncScore = parseInt(syncMatch[1].replace(/,/g, ''), 10);
            maxSyncScore = parseInt(syncMatch[2].replace(/,/g, ''), 10);
          }
        }

        const ratingText = $(".playlog_rating_detail_block > * .rating_block").text().trim();
        const rating = parseInt(ratingText, 10) || 0;

        const ratingChangeText = $(".playlog_rating_detail_block > * span").text().trim();
        const ratingChangeMatch = ratingChangeText.match(/([+-])(\d+)/);
        const ratingChange = ratingChangeMatch ? parseInt(`${ratingChangeMatch[1]}${ratingChangeMatch[2]}`, 10) : 0;

        let venue: string | null = null;
        if (region === "jp") {
          const venueElement = $("#placeName");
          if (venueElement.length > 0) {
            venue = venueElement.text().trim() || null;
          }
        }

        const noteRows = $(".playlog_notes_detail > * tr:not(:first-child)");
        if (noteRows.length === 0) {
          logger.warn(`Playlog detail parse failed (no note rows) for idx ${recentSong.idx}`);
          return null;
        }
        const noteTypes = ['tap', 'hold', 'slide', 'touch', 'break'];
        const noteData: { [key: string]: { [key: string]: number } } = {};

        noteRows.each((index, row) => {
          if (index >= 5) return;

          const cells = $(row).find("td");
          const noteType = noteTypes[index];

          noteData[noteType] = {
            cperfect: cells.length > 0 ? parseInt(cells.eq(0).text().trim(), 10) || 0 : 0,
            perfect: cells.length > 1 ? parseInt(cells.eq(1).text().trim(), 10) || 0 : 0,
            great: cells.length > 2 ? parseInt(cells.eq(2).text().trim(), 10) || 0 : 0,
            good: cells.length > 3 ? parseInt(cells.eq(3).text().trim(), 10) || 0 : 0,
            miss: cells.length > 4 ? parseInt(cells.eq(4).text().trim(), 10) || 0 : 0,
          };
        });

        return {
          recentSong,
          fastCount,
          lateCount,
          combo,
          maxCombo,
          syncScore,
          maxSyncScore,
          rating,
          ratingChange,
          venue,
          noteData,
        };
      } catch (error) {
        logger.error(error, `Error fetching playlog detail for idx ${recentSong.idx}`);
        return null;
      }
    });

    const detailResults = await Promise.all(detailPromises);

    const validResults = detailResults.filter(r => r !== null);
    if (validResults.length === 0) {
      logger.warn(`No valid detail results in batch ${Math.floor(batchStart / BATCH_SIZE) + 1}`);
      continue;
    }

    const recentSongRecords = await db.query.userRecentSongs.findMany({
      where: and(
        eq(userRecentSongs.userId, userId),
        or(
          ...validResults.map(r =>
            and(
              eq(userRecentSongs.playedAt, r!.recentSong.playedAt),
            ),
          ),
        ),
      ),
      columns: {
        id: true,
        playedAt: true,
      },
    });

    const recentSongIdMap = new Map<number, bigint>();
    for (const record of recentSongRecords) {
      recentSongIdMap.set(record.playedAt.getTime(), record.id);
    }

    const detailedInserts: typeof userRecentSongsDetailed.$inferInsert[] = [];
    for (const result of validResults) {
      const recentSongId = recentSongIdMap.get(result.recentSong.playedAt.getTime());
      if (!recentSongId) {
        logger.warn(`Could not find recentSongId for playedAt ${result.recentSong.playedAt.toISOString()}`);
        continue;
      }

      detailedInserts.push({
        recentSongId,
        fastCount: result.fastCount,
        lateCount: result.lateCount,
        combo: result.combo,
        maxCombo: result.maxCombo,
        syncScore: result.syncScore,
        maxSyncScore: result.maxSyncScore,
        tapCPerfect: result.noteData.tap?.cperfect || 0,
        tapPerfect: result.noteData.tap?.perfect || 0,
        tapGreat: result.noteData.tap?.great || 0,
        tapGood: result.noteData.tap?.good || 0,
        tapMiss: result.noteData.tap?.miss || 0,
        holdCPerfect: result.noteData.hold?.cperfect || 0,
        holdPerfect: result.noteData.hold?.perfect || 0,
        holdGreat: result.noteData.hold?.great || 0,
        holdGood: result.noteData.hold?.good || 0,
        holdMiss: result.noteData.hold?.miss || 0,
        slideCPerfect: result.noteData.slide?.cperfect || 0,
        slidePerfect: result.noteData.slide?.perfect || 0,
        slideGreat: result.noteData.slide?.great || 0,
        slideGood: result.noteData.slide?.good || 0,
        slideMiss: result.noteData.slide?.miss || 0,
        touchCPerfect: result.noteData.touch?.cperfect || 0,
        touchPerfect: result.noteData.touch?.perfect || 0,
        touchGreat: result.noteData.touch?.great || 0,
        touchGood: result.noteData.touch?.good || 0,
        touchMiss: result.noteData.touch?.miss || 0,
        breakCPerfect: result.noteData.break?.cperfect || 0,
        breakPerfect: result.noteData.break?.perfect || 0,
        breakGreat: result.noteData.break?.great || 0,
        breakGood: result.noteData.break?.good || 0,
        breakMiss: result.noteData.break?.miss || 0,
        venue: result.venue,
        rating: result.rating,
        ratingChange: result.ratingChange,
      });
    }

    if (detailedInserts.length > 0) {
      await db
        .insert(userRecentSongsDetailed)
        .values(detailedInserts)
        .onConflictDoUpdate({
          target: userRecentSongsDetailed.recentSongId,
          set: {
            fastCount: sql`excluded."fastCount"`,
            lateCount: sql`excluded."lateCount"`,
            combo: sql`excluded.combo`,
            maxCombo: sql`excluded."maxCombo"`,
            syncScore: sql`excluded."syncScore"`,
            maxSyncScore: sql`excluded."maxSyncScore"`,
            tapCPerfect: sql`excluded."tapCPerfect"`,
            tapPerfect: sql`excluded."tapPerfect"`,
            tapGreat: sql`excluded."tapGreat"`,
            tapGood: sql`excluded."tapGood"`,
            tapMiss: sql`excluded."tapMiss"`,
            holdCPerfect: sql`excluded."holdCPerfect"`,
            holdPerfect: sql`excluded."holdPerfect"`,
            holdGreat: sql`excluded."holdGreat"`,
            holdGood: sql`excluded."holdGood"`,
            holdMiss: sql`excluded."holdMiss"`,
            slideCPerfect: sql`excluded."slideCPerfect"`,
            slidePerfect: sql`excluded."slidePerfect"`,
            slideGreat: sql`excluded."slideGreat"`,
            slideGood: sql`excluded."slideGood"`,
            slideMiss: sql`excluded."slideMiss"`,
            touchCPerfect: sql`excluded."touchCPerfect"`,
            touchPerfect: sql`excluded."touchPerfect"`,
            touchGreat: sql`excluded."touchGreat"`,
            touchGood: sql`excluded."touchGood"`,
            touchMiss: sql`excluded."touchMiss"`,
            breakCPerfect: sql`excluded."breakCPerfect"`,
            breakPerfect: sql`excluded."breakPerfect"`,
            breakGreat: sql`excluded."breakGreat"`,
            breakGood: sql`excluded."breakGood"`,
            breakMiss: sql`excluded."breakMiss"`,
            venue: sql`excluded.venue`,
            rating: sql`excluded.rating`,
            ratingChange: sql`excluded."ratingChange"`,
          },
        });

      logger.debug(`Upserted ${detailedInserts.length} detailed records for batch ${Math.floor(batchStart / BATCH_SIZE) + 1}`);
    }
  }

  logger.info(`Completed detailed recent songs data fetch for user ${userId}`);
}
