import "server-only";
import { openGameSite, type GameSiteClient } from "@/server/services/games/sega/http";
import { assertMaimaiPage, musicTypeFromIcon } from "../../scores/parse-utils";
import { normalizeName } from "@/lib/name-utils";
import type { Difficulty, SongType } from "@/lib/games/maimai/types";
import { asCatalogFetcher } from "@/server/services/catalog/ingestion/merge";
import { important, type NoticeSink, type SourceChart } from "@/server/services/catalog/ingestion/types";
import { load } from "cheerio";
import { type Logger } from "pino";
import { MAIMAI_CODES } from "@/lib/games/maimai/codes";
import { maimaiChart } from "../chart";

type ParsedSong = {
  songName: string;
  level: string;
  musicType: SongType;
  difficulty: Difficulty;
  inputValue: string;
  inputName: string;
  version: number;
  index: number;
};

export function toSourceChart(song: ParsedSong): SourceChart {
  return maimaiChart({
    songName: song.songName,
    type: song.musicType,
    difficulty: song.difficulty,
    level: important(song.level),
    addedVersion: important(song.version - 13),
    extras: {
      "inputName": song.inputName,
      "inputValue": song.inputValue,
    },
  });
}

export const MaimaiScraperFetcher = asCatalogFetcher(async ({ region, version, session, log, notice }) => {
  const site = openGameSite("maimai", region, session, { assertPage: assertMaimaiPage });
  const parsedSongs = await prepareMaimaiScraper(site, version, log, notice);
  return parsedSongs.map(toSourceChart);
});

async function prepareMaimaiScraper(site: GameSiteClient, version: number, log: Logger, notice: NoticeSink) {
  const allSongData: ParsedSong[] = [];

  // Fetch data for legacy versions (0-12) and current versions (13 to 13 + versionsCount - 1)
  const versionRanges = [
    { start: 0, end: 12 },
    { start: 13, end: 13 + version },
  ];

  const difficultyNames = ["bas", "adv", "exp", "mas", "remas", "utage"];
  const versionSummaries: string[] = [];

  for (const range of versionRanges) {
    log.info({ from: range.start, to: range.end }, "Fetching maimai versions");

    for (let version = range.start; version <= range.end; version++) {
      const promises: Promise<ParsedSong[]>[] = [];
      for (let difficulty of [0, 1, 2, 3, 4, 10]) {
        try {
          promises.push(fetchSongDataForDifficulty(site, difficulty === 10 ? "utage" : MAIMAI_CODES.difficulty[difficulty], difficulty, version, log));
        } catch (error) {
          log.warn({ version, difficulty, err: error }, "Failed to fetch data");
        }
      }
      const difficultyData = await Promise.all(promises);

      // Validate: if any non-utage difficulty returned songs, all non-utage difficulties must have songs.
      // If a non-utage difficulty returns 0 songs while others have data, the scrape session is likely broken.
      const nonUtageResults = difficultyData.slice(0, 5); // indices 0-4 are basic/advanced/expert/master/remaster
      const hasAnySongs = nonUtageResults.some(songs => songs.length > 0);
      if (hasAnySongs) {
        const emptyDifficulties = nonUtageResults
          .map((songs, i) => ({ difficulty: MAIMAI_CODES.difficulty[i], count: songs.length }))
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

  log.info({ songCount: allSongData.length }, "Fetched maimai charts of every version and difficulty");

  return allSongData;
}

// Helper function to fetch and parse song data for a specific difficulty and version
export async function fetchSongDataForDifficulty(site: GameSiteClient, difficultyName: Difficulty, difficulty: number, version: number, log: Logger): Promise<ParsedSong[]> {
  const childLog = log.child({ version, difficulty });
  const songsHtml = await site.html(`record/musicVersion/search/?version=${version}&diff=${difficulty}`);

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


  blocks.each((index, element) => {
    try {
      const block = $(element);

      // Extract music type (dx/std) from icon image
      const iconElement = block.find('img.music_kind_icon');
      if (iconElement.length === 0) {
        log.warn({ index }, "Chart has no chart type icon");
        return; // Skip this block
      }

      let musicType: SongType;
      if (difficultyName === "utage") {
        musicType = "dx";
      } else {
        const detected = musicTypeFromIcon(iconElement.attr('src'));
        if (!detected) {
          log.warn({ index, value: iconElement.attr("src") }, "Chart has an unknown chart type icon");
          return;
        }
        musicType = detected;
      }

      // Extract song name
      const nameElement = block.find('.music_name_block');
      if (nameElement.length === 0) {
        log.warn({ index }, "Chart has no name block");
        return; // Skip this block
      }
      const songName = normalizeName(nameElement.text().trim());

      // Extract level
      const levelElement = block.find('.music_lv_block');
      if (levelElement.length === 0) {
        log.warn({ index }, "Chart has no level block");
        return; // Skip this block
      }
      const level = levelElement.text().trim();

      // Extract input value and name
      const inputElement = block.find('input');
      if (inputElement.length === 0) {
        log.warn({ index }, "Chart has no detail form input");
        return; // Skip this block
      }
      const inputValue = inputElement.attr('value');
      const inputName = inputElement.attr('name');

      if (!inputValue || !inputName) {
        log.warn({ index }, "Chart detail form input has no value or name");
        return; // Skip this block
      }

      const songData = {
        songName,
        level,
        musicType,
        difficulty: difficultyName,
        inputValue,
        inputName,
        version,
        index,
      };

      songs.push(songData);
    } catch (error) {
      log.error({ err: error, index }, "Could not read a chart");
    }
  });

  log.debug({ songCount: songs.length }, "Read maimai charts");
  return songs;
}
