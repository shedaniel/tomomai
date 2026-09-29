import "server-only";
import { load } from "cheerio";
import { logger } from "@/lib/logger";
import { normalizeName } from "@/lib/name-utils";
import type { Difficulty } from "@/lib/games/maimai/types";
import type { GameSiteClient } from "@/server/services/games/sega/http";
import { musicTypeFromIcon } from "../parse-utils";
import type { ScoreData } from "../types";
import { parseScoreData } from "./parse";

// maimai DX NET's `diff` search parameter for each difficulty.
const NET_DIFF_PARAMS: Readonly<Record<Difficulty, number>> = { basic: 0, advanced: 1, expert: 2, master: 3, remaster: 4, utage: 10 };

export async function fetchSongsData(site: GameSiteClient, difficulty: Difficulty): Promise<ScoreData[]> {
  const songsHtml = await site.html(`record/musicGenre/search/?genre=99&diff=${NET_DIFF_PARAMS[difficulty]}`);
  logger.debug(`Songs data for difficulty ${difficulty} fetched successfully, length: ${songsHtml.length} characters`);
  return parseScoreData(songsHtml, difficulty);
}

// Hidden songs from the rating-target page (intl only).
export async function fetchHiddenSongsData(site: GameSiteClient, knownScores: readonly ScoreData[]): Promise<ScoreData[]> {
  logger.info("Fetching hidden songs data from rating target music page...");

  const html = await site.html("home/ratingTargetMusic/");
  logger.debug(`Hidden songs data fetched successfully, length: ${html.length} characters`);

  const $ = load(html);
  const hiddenSongs: ScoreData[] = [];

  const difficulties: readonly Difficulty[] = ["basic", "advanced", "expert", "master", "remaster"];

  for (const difficulty of difficulties) {
    const blocks = $(`.music_${difficulty}_score_back`);
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

        const songExists = knownScores.some(song =>
          song.difficulty === difficulty && song.songName === songName && song.musicType === musicType
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
