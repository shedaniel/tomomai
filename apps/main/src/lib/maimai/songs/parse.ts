import { load } from "cheerio";
import { DIFFICULTY_ENUM } from "../../db/types";
import { logger } from "../../logger";
import { normalizeName } from "../../name-utils";
import { FullCombo, FullSync, SongType } from "../../types";
import { musicTypeFromIcon } from "../parse-utils";
import type { ScoreData } from "../types";

// Parse score data from HTML for a specific difficulty
export function parseScoreData(html: string, difficulty: number): ScoreData[] {
  const $ = load(html);

  // Use correct selector based on difficulty
  const difficultySelectors: Record<number, string> = {
    0: ".music_basic_score_back",
    1: ".music_advanced_score_back",
    2: ".music_expert_score_back",
    3: ".music_master_score_back",
    4: ".music_remaster_score_back",
    10: ".music_utage_score_back"
  };

  const selector = difficultySelectors[difficulty];
  if (!selector) {
    logger.error(`Invalid difficulty: ${difficulty}`);
    return [];
  }

  const blocks = $(selector);
  const scores: ScoreData[] = [];

  logger.debug(`Found ${blocks.length} score blocks for difficulty ${difficulty} using selector ${selector}`);

  blocks.each((index, element) => {
    try {
      const block = $(element);

      // Only consider blocks that contain .music_score_block (played songs)
      const scoreBlocks = block.find('.music_score_block');
      if (scoreBlocks.length === 0) {
        return; // Skip unplayed songs
      }

      const parent = block.parent();

      // Extract music type (dx/std) from icon image
      let musicType: SongType;
      if (difficulty === 10) {
        musicType = "dx";
      } else {
        const iconElement = parent.find('img.music_kind_icon');
        if (iconElement.length === 0) {
          logger.warn(`No music kind icon found for score block ${index}`);
          return;
        }

        const iconSrc = iconElement.attr('src');
        const detected = musicTypeFromIcon(iconSrc);
        if (!detected) {
          logger.warn(`Unknown or missing music type icon in score block ${index}: ${iconSrc}`);
          return;
        }
        musicType = detected;
      }

      // Extract song name
      const nameElement = block.find('.music_name_block');
      if (nameElement.length === 0) {
        logger.warn(`No music name block found for score block ${index}`);
        return;
      }
      const songName = normalizeName(nameElement.text().trim());

      // Extract level
      const levelElement = block.find('.music_lv_block');
      if (levelElement.length === 0) {
        logger.warn(`No music level block found for score block ${index}`);
        return;
      }
      const level = levelElement.text().trim();

      // Extract achievement and dx score from the two .music_score_block elements
      if (scoreBlocks.length < 2) {
        logger.warn(`Expected 2 score blocks, found ${scoreBlocks.length} for song ${songName}`);
        return;
      }

      // First score block: achievement (e.g., "97.6977%")
      const achievementText = scoreBlocks.eq(0).text().trim();
      const achievementMatch = achievementText.match(/(\d+\.?\d*)%/);
      if (!achievementMatch) {
        logger.warn(`Could not parse achievement: ${achievementText} for song ${songName}`);
        return;
      }
      const achievementFloat = parseFloat(achievementMatch[1]);
      const achievement = Math.round(achievementFloat * 10000); // Convert to 10000x format

      // Second score block: dx score (e.g., "758 / 963")
      const dxScoreText = scoreBlocks.eq(1).text().trim();
      const dxScoreMatch = dxScoreText.match(/(\d+)\s*\/\s*\d+/);
      if (!dxScoreMatch) {
        logger.warn(`Could not parse dx score: ${dxScoreText} for song ${songName}`);
        return;
      }
      const dxScore = parseInt(dxScoreMatch[1], 10);

      // Extract fs and fc from the three .h_30 elements
      const h30Elements = block.find('.h_30');
      if (h30Elements.length < 2) {
        logger.warn(`Expected at least 2 h_30 elements, found ${h30Elements.length} for song ${songName}`);
        return;
      }

      // First .h_30 is fs (sync status)
      let fs: FullSync = "none";
      const fsElement = h30Elements.eq(0);
      const fsSrc = fsElement.attr('src');
      if (fsSrc) {
        if (fsSrc.includes('_fdxp.png')) {
          fs = "fdx+";
        } else if (fsSrc.includes('_fdx.png')) {
          fs = "fdx";
        } else if (fsSrc.includes('_fsp.png')) {
          fs = "fs+";
        } else if (fsSrc.includes('_fs.png')) {
          fs = "fs";
        } else if (fsSrc.includes('_sync.png')) {
          fs = "sync";
        }
      }

      // Second .h_30 is fc (full combo status)
      let fc: FullCombo = "none";
      const fcElement = h30Elements.eq(1);
      const fcSrc = fcElement.attr('src');
      if (fcSrc) {
        if (fcSrc.includes('_app.png')) {
          fc = "ap+";
        } else if (fcSrc.includes('_ap.png')) {
          fc = "ap";
        } else if (fcSrc.includes('_fcp.png')) {
          fc = "fc+";
        } else if (fcSrc.includes('_fc.png')) {
          fc = "fc";
        }
      }

      // Map difficulty number to difficulty name
      const difficultyName = difficulty === 10 ? "utage" : DIFFICULTY_ENUM[difficulty] || "basic";

      const scoreData: ScoreData = {
        songName,
        level,
        musicType,
        difficulty: difficultyName,
        difficultyNumber: difficulty,
        achievement,
        dxScore,
        fc,
        fs,
      };

      scores.push(scoreData);

      logger.debug(`Extracted score ${index}: ${songName} (${level}, ${musicType}, ${difficultyName}) - ${achievementFloat}%, ${dxScore} dx, ${fc}/${fs}`);
    } catch (error) {
      logger.error(error, `Error processing score block ${index}`);
    }
  });

  logger.info(`Successfully extracted ${scores.length} scores for difficulty ${difficulty}`);
  return scores;
}
