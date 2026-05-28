import { load } from "cheerio";
import { appendFetchState } from "../../fetch-states-server";
import { getStateForDifficulty } from "../../fetch-states";
import { logger } from "../../logger";
import { normalizeName } from "../../name-utils";
import { Difficulty, Region } from "../../types";
import { maimaiBaseUrl, maimaiGetHtml } from "../http";
import { musicTypeFromIcon } from "../parse-utils";
import type { ScoreData } from "../types";
import { parseScoreData } from "./parse";

export async function fetchSongsData(cookies: string, difficulty: number, region: Region): Promise<ScoreData[]> {
  const baseUrl = maimaiBaseUrl(region);
  const songsUrl = `${baseUrl}/maimai-mobile/record/musicGenre/search/?genre=99&diff=${difficulty}`;
  logger.info(`Fetching songs data for difficulty ${difficulty} from: ${songsUrl}`);

  const songsHtml = await maimaiGetHtml(songsUrl, cookies, `${baseUrl}/maimai-mobile/`);
  logger.debug(`Songs data for difficulty ${difficulty} fetched successfully, length: ${songsHtml.length} characters`);

  return parseScoreData(songsHtml, difficulty);
}

export async function fetchAllSongsData(cookies: string, region: Region, sessionId?: bigint): Promise<{ [difficulty: number]: ScoreData[] }> {
  logger.info(`Fetching songs data for all difficulties (0-4)${sessionId ? ' with tracking' : ''}`);

  const difficultyPromises = [0, 1, 2, 3, 4, 10].map(difficulty => {
    return fetchSongsData(cookies, difficulty, region).then((scoreData) => {
      logger.info(`Successfully fetched ${scoreData.length} scores for difficulty ${difficulty}`);

      if (sessionId) {
        const state = getStateForDifficulty(difficulty);
        if (state) {
          appendFetchState(sessionId, state);
        }
      }

      return { difficulty, scoreData };
    }).catch((error) => {
      logger.error(error, `Failed to fetch songs for difficulty ${difficulty}`);
      throw new Error(`Failed to fetch songs for difficulty ${difficulty}: ${error instanceof Error ? error.message : "Unknown error"}`);
    });
  });

  const results = await Promise.all(difficultyPromises);

  const songsData: { [difficulty: number]: ScoreData[] } = {};
  for (const { difficulty, scoreData } of results) {
    songsData[difficulty] = scoreData;
  }

  logger.info(`Successfully fetched songs data for all difficulties`);
  return songsData;
}

// Hidden songs from the rating-target page (intl only).
export async function fetchHiddenSongsData(cookies: string, allSongsData: { [difficulty: number]: ScoreData[] }): Promise<ScoreData[]> {
  logger.info("Fetching hidden songs data from rating target music page...");

  const baseUrl = "https://maimaidx-eng.com";
  const html = await maimaiGetHtml(`${baseUrl}/maimai-mobile/home/ratingTargetMusic/`, cookies, `${baseUrl}/maimai-mobile/`);
  logger.debug(`Hidden songs data fetched successfully, length: ${html.length} characters`);

  const $ = load(html);
  const hiddenSongs: ScoreData[] = [];

  const difficultyInfo: { selector: string, difficulty: Difficulty, difficultyNumber: number }[] = [
    { selector: ".music_basic_score_back", difficulty: "basic", difficultyNumber: 0 },
    { selector: ".music_advanced_score_back", difficulty: "advanced", difficultyNumber: 1 },
    { selector: ".music_expert_score_back", difficulty: "expert", difficultyNumber: 2 },
    { selector: ".music_master_score_back", difficulty: "master", difficultyNumber: 3 },
    { selector: ".music_remaster_score_back", difficulty: "remaster", difficultyNumber: 4 }
  ];

  for (const { selector, difficulty, difficultyNumber } of difficultyInfo) {
    const blocks = $(selector);
    logger.debug(`Found ${blocks.length} score blocks for ${difficulty} difficulty`);

    blocks.each((index, element) => {
      try {
        const block = $(element);

        const nameElement = block.find('.music_name_block');
        if (nameElement.length === 0) {
          logger.warn(`No music name block found for ${difficulty} score block ${index}`);
          return;
        }
        const songName = normalizeName(nameElement.text().trim());

        const iconElement = block.find('img.music_kind_icon');
        if (iconElement.length === 0) {
          logger.warn(`No music kind icon found for ${difficulty} score block ${index}: ${songName}`);
          return;
        }

        const musicType = musicTypeFromIcon(iconElement.attr('src'));
        if (!musicType) {
          logger.warn(`Unknown or missing music type icon for ${difficulty} score block ${index}: ${songName}`);
          return;
        }

        const existingSongs = allSongsData[difficultyNumber] || [];
        const songExists = existingSongs.some(song =>
          song.songName === songName && song.musicType === musicType
        );

        if (songExists) {
          return;
        }

        const scoreBlocks = block.find('.music_score_block');
        let achievement = 0;

        if (scoreBlocks.length > 0) {
          const achievementText = scoreBlocks.eq(0).text().trim();
          const achievementMatch = achievementText.match(/(\d+\.?\d*)%/);
          if (achievementMatch) {
            const achievementFloat = parseFloat(achievementMatch[1]);
            achievement = Math.round(achievementFloat * 10000);
          }
        }

        const hiddenSongData: ScoreData = {
          songName,
          level: "0",
          musicType,
          difficulty,
          difficultyNumber,
          achievement,
          dxScore: 0,
          fc: "none",
          fs: "none"
        };

        hiddenSongs.push(hiddenSongData);
        logger.debug(`Found hidden song: ${songName} (${musicType}, ${difficulty}) - ${achievement / 10000}%`);

      } catch (error) {
        logger.error(error, `Error processing hidden song ${difficulty} score block ${index}`);
      }
    });
  }

  logger.info(`Successfully found ${hiddenSongs.length} hidden songs`);
  return hiddenSongs;
}
