import { load } from "cheerio";
import { logger } from "../../logger";
import { normalizeName } from "../../name-utils";
import { Difficulty, FullCombo, FullSync, Region, SongType } from "../../types";
import { maimaiBaseUrl, maimaiGetHtml } from "../http";
import { musicTypeFromIcon } from "../parse-utils";
import type { RecentSongData } from "../types";

export async function fetchRecentSongsData(cookies: string, region: Region, sessionId: bigint): Promise<RecentSongData[]> {
  const baseUrl = maimaiBaseUrl(region);
  const recentSongsUrl = `${baseUrl}/maimai-mobile/record/`;
  logger.info(`Fetching recent songs data from: ${recentSongsUrl}`);

  const recentSongsHtml = await maimaiGetHtml(recentSongsUrl, cookies, `${baseUrl}/maimai-mobile/`);
  logger.debug(`Recent songs data fetched successfully, length: ${recentSongsHtml.length} characters`);

  const $ = load(recentSongsHtml);
  const recentSongs: RecentSongData[] = [];

  const records = $(".p_10.t_l.f_0.v_b");
  logger.debug(`Found ${records.length} recent play records`);

  records.each((index, element) => {
    try {
      const record = $(element);

      const trackText = record.find(".sub_title > .red").text().trim();
      const trackMatch = trackText.match(/(?:TRACK|曲目)\s*(\d+)/i);
      if (!trackMatch) {
        logger.warn(`Could not parse track number from: ${trackText}`);
        return;
      }
      const track = parseInt(trackMatch[1], 10);

      const playTimeText = record.find(".sub_title > .v_b:not(.red)").text().trim();
      const playTimeMatch = playTimeText.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
      if (!playTimeMatch) {
        logger.warn(`Could not parse play time from: ${playTimeText}`);
        return;
      }
      const [, year, month, day, hour, minute] = playTimeMatch;
      const playedAt = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);

      const level = record.find(".music_lv_back").text().trim();

      const diffImg = record.find("img.playlog_diff");
      const diffImgSrc = diffImg.attr("src") || "";
      let difficultyNumber = 0;
      let difficulty: Difficulty = "basic";

      if (diffImgSrc.includes("utage")) {
        difficultyNumber = 10;
        difficulty = "utage";
      } else if (diffImgSrc.includes("remaster")) {
        difficultyNumber = 4;
        difficulty = "remaster";
      } else if (diffImgSrc.includes("master")) {
        difficultyNumber = 3;
        difficulty = "master";
      } else if (diffImgSrc.includes("expert")) {
        difficultyNumber = 2;
        difficulty = "expert";
      } else if (diffImgSrc.includes("advanced")) {
        difficultyNumber = 1;
        difficulty = "advanced";
      } else if (diffImgSrc.includes("basic")) {
        difficultyNumber = 0;
        difficulty = "basic";
      }

      const basicBlock = record.find(".basic_block");
      let songName = "";
      basicBlock.contents().each((i, node) => {
        if (node.type === "text") {
          const text = $(node).text().trim();
          if (text) {
            songName = text;
          }
        }
      });
      songName = normalizeName(songName);

      if (!songName) {
        logger.warn(`Could not extract song name for record ${index}`);
        return;
      }

      const achievementText = record.find(".playlog_achievement_txt").text().trim();
      const achievementMatch = achievementText.match(/(\d+\.?\d*)%/);
      if (!achievementMatch) {
        logger.warn(`Could not parse achievement from: ${achievementText}`);
        return;
      }
      const achievementFloat = parseFloat(achievementMatch[1]);
      const achievement = Math.round(achievementFloat * 10000);

      const dxScoreText = record.find(".playlog_score_block > .f_15").text().trim();
      const dxScoreMatch = dxScoreText.match(/(\d+(?:,\d+)?)\s*\/\s*(\d+(?:,\d+)?)/);
      if (!dxScoreMatch) {
        logger.warn(`Could not parse DX score from: ${dxScoreText}`);
        return;
      }
      const dxScore = parseInt(dxScoreMatch[1].replace(/,/g, ''), 10);
      const maxDxScore = parseInt(dxScoreMatch[2].replace(/,/g, ''), 10);

      const resultImages = record.find(".playlog_result_innerblock > img");

      let fc: FullCombo = "none";
      let fs: FullSync = "none";

      if (resultImages.length > 0) {
        const fcSrc = $(resultImages[0]).attr("src") || "";
        if (fcSrc.includes("applus.png") || fcSrc.includes("app.png")) {
          fc = "ap+";
        } else if (fcSrc.includes("ap.png")) {
          fc = "ap";
        } else if (fcSrc.includes("fcplus.png") || fcSrc.includes("fcp.png")) {
          fc = "fc+";
        } else if (fcSrc.includes("fc.png")) {
          fc = "fc";
        }
      }

      if (resultImages.length > 1) {
        const fsSrc = $(resultImages[1]).attr("src") || "";
        if (fsSrc.includes("fsdplus.png")) {
          fs = "fdx+";
        } else if (fsSrc.includes("fsd.png")) {
          fs = "fdx";
        } else if (fsSrc.includes("fsplus.png") || fsSrc.includes("fsp.png")) {
          fs = "fs+";
        } else if (fsSrc.includes("fs.png")) {
          fs = "fs";
        } else if (fsSrc.includes("sync.png")) {
          fs = "sync";
        }
      }

      const musicKindIcon = record.find("img.playlog_music_kind_icon");
      const musicType: SongType = difficulty === "utage"
        ? "dx"
        : (musicTypeFromIcon(musicKindIcon.attr("src")) ?? "std");

      const idxInput = record.find("input[name='idx']");
      const idx = idxInput.attr("value") || "";
      if (!idx) {
        logger.warn(`Could not extract idx value for record ${index}`);
        return;
      }

      const recentSong: RecentSongData = {
        songName,
        level,
        musicType,
        difficulty,
        difficultyNumber,
        achievement,
        dxScore,
        maxDxScore,
        fc,
        fs,
        track,
        playedAt,
        idx,
      };

      recentSongs.push(recentSong);
      logger.debug(`Extracted recent play ${index}: ${songName} (Track ${track}, ${level}, ${difficulty}) - ${achievementFloat}%, ${dxScore}/${maxDxScore}`);

    } catch (error) {
      logger.error(error, `Error processing recent play record ${index}`);
    }
  });

  void sessionId;

  logger.info(`Successfully extracted ${recentSongs.length} recent plays`);
  return recentSongs;
}
