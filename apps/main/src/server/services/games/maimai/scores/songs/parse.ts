import "server-only";
import { load } from "cheerio";
import { normalizeName } from "@/lib/name-utils";
import { getLogger } from "@/lib/request-logger";
import type { Difficulty, FullCombo, FullSync, SongType } from "@/lib/games/maimai/types";
import { musicTypeFromIcon } from "../parse-utils";
import type { ScoreData } from "../types";

/** Reads the played charts from one difficulty's score list page. */
export function parseScoreData(html: string, difficulty: Difficulty): ScoreData[] {
  const log = getLogger();
  const $ = load(html);
  const blocks = $(`.music_${difficulty}_score_back`);
  const scores: ScoreData[] = [];

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
      if (difficulty === "utage") {
        musicType = "dx";
      } else {
        const iconElement = parent.find('img.music_kind_icon');
        if (iconElement.length === 0) {
          log.warn({ difficulty, index }, "Score has no chart type icon");
          return;
        }

        const iconSrc = iconElement.attr('src');
        const detected = musicTypeFromIcon(iconSrc);
        if (!detected) {
          log.warn({ difficulty, index, value: iconSrc }, "Score has an unknown chart type icon");
          return;
        }
        musicType = detected;
      }

      // Extract song name
      const nameElement = block.find('.music_name_block');
      if (nameElement.length === 0) {
        log.warn({ difficulty, index }, "Score has no name block");
        return;
      }
      const songName = normalizeName(nameElement.text().trim());

      // Extract level
      const levelElement = block.find('.music_lv_block');
      if (levelElement.length === 0) {
        log.warn({ difficulty, index }, "Score has no level block");
        return;
      }
      const level = levelElement.text().trim();

      // Extract achievement and dx score from the two .music_score_block elements
      if (scoreBlocks.length < 2) {
        log.warn({ difficulty, index, count: scoreBlocks.length }, "Score does not have two score blocks");
        return;
      }

      // First score block: achievement (e.g., "97.6977%")
      const achievementText = scoreBlocks.eq(0).text().trim();
      const achievementMatch = achievementText.match(/(\d+\.?\d*)%/);
      if (!achievementMatch) {
        log.warn({ difficulty, index, value: achievementText }, "Could not parse a score achievement");
        return;
      }
      const achievementFloat = parseFloat(achievementMatch[1]);
      const achievement = Math.round(achievementFloat * 10000); // Convert to 10000x format

      // Second score block: dx score (e.g., "758 / 963")
      const dxScoreText = scoreBlocks.eq(1).text().trim();
      const dxScoreMatch = dxScoreText.match(/(\d+)\s*\/\s*\d+/);
      if (!dxScoreMatch) {
        log.warn({ difficulty, index, value: dxScoreText }, "Could not parse a score DX score");
        return;
      }
      const dxScore = parseInt(dxScoreMatch[1], 10);

      // Extract fs and fc from the three .h_30 elements
      const h30Elements = block.find('.h_30');
      if (h30Elements.length < 2) {
        log.warn({ difficulty, index, count: h30Elements.length }, "Score has fewer than two status icons");
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

      const scoreData: ScoreData = {
        songName,
        level,
        musicType,
        difficulty,
        achievement,
        dxScore,
        fc,
        fs,
      };

      scores.push(scoreData);
    } catch (error) {
      log.error({ err: error, difficulty, index }, "Could not read a score");
    }
  });

  return scores;
}
