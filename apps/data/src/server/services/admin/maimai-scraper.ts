import { logger } from "@/lib/logger";
import { maimaiBaseUrl, maimaiRequest } from "@tomomai/server/maimai-http";
import { musicTypeFromIcon } from "@tomomai/catalog/parse-utils";
import { VersionId } from "@tomomai/catalog/metadata";
import { normalizeName } from "@tomomai/catalog/name-utils";
import { Difficulty, Level, Region, SongType } from "@tomomai/catalog/types";
import { ParsedSong } from "@/lib/types/update";
import { important, PendingSong } from "@/server/utils/admin/type";
import { load } from "cheerio";
import { asFetcher, NoticeSink } from "./fetcher-utils";
import { type Logger } from "pino";
import { DIFFICULTY_ENUM } from "@tomomai/catalog/enums";

// Convert ParsedSong to PendingSong
export function parsedSongToPendingSong(song: ParsedSong): PendingSong {
  return {
    songName: song.songName,
    type: song.musicType,
    difficulty: song.difficulty as Difficulty,
    level: important(song.level),
    addedVersion: important((song.version - 13) as VersionId),
    extras: {
      "inputName": song.inputName,
      "inputValue": song.inputValue,
    },
  } satisfies PendingSong;
}

export const MaimaiScraperFetcher = asFetcher(async ({ region, version, cookies, log, notice }) => {
  const parsedSongs = await prepareMaimaiScraper(region, version, cookies, log, notice);
  return parsedSongs.map(parsedSongToPendingSong);
});

export async function prepareMaimaiScraper(region: Region, version: VersionId, cookies: string, log: Logger, notice: NoticeSink) {
  log.info("Fetching and parsing song data for all difficulties and versions...");
  const allSongData: ParsedSong[] = [];

  // Fetch data for legacy versions (0-12) and current versions (13 to 13 + versionsCount - 1)
  const versionRanges = [
    { start: 0, end: 12, description: "legacy versions" },
    { start: 13, end: 13 + version, description: "current versions" }
  ];

  const difficultyNames = ["bas", "adv", "exp", "mas", "remas", "utage"];
  const versionSummaries: string[] = [];

  for (const range of versionRanges) {
    log.info(`Fetching ${range.description} (versions ${range.start}-${range.end})...`);

    for (let version = range.start; version <= range.end; version++) {
      const promises: Promise<ParsedSong[]>[] = [];
      for (let difficulty of [0, 1, 2, 3, 4, 10]) {
        log.debug(`Fetching songs for version ${version}, difficulty ${difficulty}...`);
        try {
          promises.push(fetchSongDataForDifficulty(region, cookies, difficulty === 10 ? "utage" : DIFFICULTY_ENUM[difficulty], difficulty, version, log));
        } catch (error) {
          log.warn({ version, difficulty, error }, `Failed to fetch data`);
        }
      }
      const difficultyData = await Promise.all(promises);

      // Validate: if any non-utage difficulty returned songs, all non-utage difficulties must have songs.
      // If a non-utage difficulty returns 0 songs while others have data, the scrape session is likely broken.
      const nonUtageResults = difficultyData.slice(0, 5); // indices 0-4 are basic/advanced/expert/master/remaster
      const hasAnySongs = nonUtageResults.some(songs => songs.length > 0);
      if (hasAnySongs) {
        const emptyDifficulties = nonUtageResults
          .map((songs, i) => ({ difficulty: DIFFICULTY_ENUM[i], count: songs.length }))
          .filter(d => d.count === 0);
        if (emptyDifficulties.length > 0) {
          const emptyNames = emptyDifficulties.map(d => d.difficulty).join(", ");
          throw new Error(
            `Scraper integrity check failed: version ${version} has songs but difficulties [${emptyNames}] returned 0 songs. The scrape session may be broken.`
          );
        }
      } else {
        throw new Error(
          `Scraper integrity check failed: version ${version} returned 0 songs across all difficulties. The scrape session may be broken.`
        );
      }

      const versionTotal = difficultyData.reduce((sum, d) => sum + d.length, 0);
      if (versionTotal > 0) {
        const diffBreakdown = difficultyData.map((d, i) => `${difficultyNames[i]}:${d.length}`).join(" ");
        versionSummaries.push(`v${version}: ${versionTotal} (${diffBreakdown})`);
      }

      allSongData.push(...difficultyData.flat());
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const uniqueSongs = new Set(allSongData.map(s => s.songName));
  notice.addDetail(`${uniqueSongs.size} unique songs, ${allSongData.length} charts`);
  for (const summary of versionSummaries) {
    notice.addDetail(summary);
  }

  log.info({ songs: allSongData }, `Total songs fetched from all difficulties and versions: ${allSongData.length}`);

  return allSongData;
}

// Helper function to fetch and parse song data for a specific difficulty and version
export async function fetchSongDataForDifficulty(region: Region, cookies: string, difficultyName: Difficulty, difficulty: number, version: number, log: Logger): Promise<ParsedSong[]> {
  const baseUrl = maimaiBaseUrl(region);
  const songsUrl = `${baseUrl}/maimai-mobile/record/musicVersion/search/?version=${version}&diff=${difficulty}`;
  const childLog = log.child({ version, difficulty });
  childLog.debug(`Fetching songs data from: ${songsUrl}`);

  const songsResponse = await maimaiRequest(songsUrl, cookies, `${baseUrl}/maimai-mobile/`);

  childLog.debug({ status: songsResponse.status }, `Songs data response got`);

  if (songsResponse.status !== 200) {
    const errorMsg = `Failed to fetch songs data for version ${version}, difficulty ${difficultyName}: HTTP ${songsResponse.status}`;
    childLog.error({ res: await songsResponse.text() }, errorMsg);
    throw new Error(errorMsg);
  }

  const songsHtml = await songsResponse.text();
  childLog.debug(`Songs data fetched successfully, length: ${songsHtml.length} characters`);

  return parseSongData(songsHtml, difficultyName, difficulty, version, childLog);
}


// Helper function to parse song data from HTML
function parseSongData(html: string, difficultyName: Difficulty, difficulty: number, version: number, log: Logger): ParsedSong[] {
  const $ = load(html);

  // Use correct selector based on difficulty
  const difficultySelectors = [
    ".music_basic_score_back",      // difficulty 0
    ".music_advanced_score_back",   // difficulty 1
    ".music_expert_score_back",     // difficulty 2
    ".music_master_score_back",     // difficulty 3
    ".music_remaster_score_back",   // difficulty 4
    ".music__score_back",           // difficulty 10
  ];

  const selector = difficultySelectors[difficultyName === "utage" ? 5 : difficulty];
  if (!selector) {
    log.error({ difficulty }, "Invalid difficulty in parseSongData");
    return [];
  }

  const blocks = $(selector);
  const songs: ParsedSong[] = [];

  log.debug(`Found ${blocks.length} song blocks for difficulty ${difficultyName} using selector ${selector}`);

  blocks.each((index, element) => {
    try {
      const block = $(element);

      // Extract music type (dx/std) from icon image
      const iconElement = block.find('img.music_kind_icon');
      if (iconElement.length === 0) {
        log.warn(`No music kind icon found for block ${index}`);
        return; // Skip this block
      }

      let musicType: SongType;
      if (difficultyName === "utage") {
        musicType = "dx";
      } else {
        const detected = musicTypeFromIcon(iconElement.attr('src'));
        if (!detected) {
          log.warn(`Unknown or missing music type icon for block ${index}: ${iconElement.attr('src')}`);
          return;
        }
        musicType = detected;
      }

      // Extract song name
      const nameElement = block.find('.music_name_block');
      if (nameElement.length === 0) {
        log.warn(`No music name block found for block ${index}`);
        return; // Skip this block
      }
      const songName = normalizeName(nameElement.text().trim());

      // Extract level
      const levelElement = block.find('.music_lv_block');
      if (levelElement.length === 0) {
        log.warn(`No music level block found for block ${index}`);
        return; // Skip this block
      }
      const level = levelElement.text().trim();

      // Extract input value and name
      const inputElement = block.find('input');
      if (inputElement.length === 0) {
        log.warn(`No input element found for block ${index}`);
        return; // Skip this block
      }
      const inputValue = inputElement.attr('value');
      const inputName = inputElement.attr('name');

      if (!inputValue || !inputName) {
        log.warn(`Input element missing value or name attribute in block ${index}`);
        return; // Skip this block
      }

      const songData = {
        songName,
        level: level as Level,
        musicType,
        difficulty: difficultyName,
        inputValue,
        inputName,
        version,
        index,
      };

      songs.push(songData);

      log.debug(`Extracted song ${index}: ${songName} (${level}, ${musicType}, ${difficultyName})`);
    } catch (error) {
      logger.error({ error, index }, "Error processing song block");
    }
  });

  log.debug(`Successfully extracted ${songs.length} songs for difficulty ${difficultyName}`);
  return songs;
}
