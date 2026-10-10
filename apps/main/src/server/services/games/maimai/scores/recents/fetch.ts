import "server-only";
import { load } from "cheerio";
import { normalizeName } from "@/lib/name-utils";
import { getLogger } from "@/lib/request-logger";
import type { Difficulty, FullCombo, FullSync, SongType } from "@/lib/games/maimai/types";
import type { GameSiteClient } from "@/server/services/games/sega/http";
import { musicTypeFromIcon } from "../parse-utils";
import type { RecentSongData } from "../types";

export async function fetchRecentSongsData(site: GameSiteClient): Promise<RecentSongData[]> {
  const log = getLogger();
  const recentSongsHtml = await site.html("record/");

  const $ = load(recentSongsHtml);
  const recentSongs: RecentSongData[] = [];

  const records = $(".p_10.t_l.f_0.v_b");

  records.each((index, element) => {
    try {
      const record = $(element);

      const trackText = record.find(".sub_title > .red").text().trim();
      const trackMatch = trackText.match(/(?:TRACK|曲目)\s*(\d+)/i);
      if (!trackMatch) {
        log.warn({ index, value: trackText }, "Could not parse a recent play track number");
        return;
      }
      const track = parseInt(trackMatch[1], 10);

      const playTimeText = record.find(".sub_title > .v_b:not(.red)").text().trim();
      const playTimeMatch = playTimeText.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
      if (!playTimeMatch) {
        log.warn({ index, value: playTimeText }, "Could not parse a recent play time");
        return;
      }
      const [, year, month, day, hour, minute] = playTimeMatch;
      const playedAt = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);

      const level = record.find(".music_lv_back").text().trim();

      const diffImg = record.find("img.playlog_diff");
      const diffImgSrc = diffImg.attr("src") || "";
      let difficulty: Difficulty = "basic";

      if (diffImgSrc.includes("utage")) {
        difficulty = "utage";
      } else if (diffImgSrc.includes("remaster")) {
        difficulty = "remaster";
      } else if (diffImgSrc.includes("master")) {
        difficulty = "master";
      } else if (diffImgSrc.includes("expert")) {
        difficulty = "expert";
      } else if (diffImgSrc.includes("advanced")) {
        difficulty = "advanced";
      }

      const basicBlock = record.find(".basic_block");
      let songName = "";
      basicBlock.contents().each((_, node) => {
        if (node.type === "text") {
          const text = $(node).text().trim();
          if (text) {
            songName = text;
          }
        }
      });
      songName = normalizeName(songName);

      if (!songName) {
        log.warn({ index }, "Recent play has no song name");
        return;
      }

      const achievementText = record.find(".playlog_achievement_txt").text().trim();
      const achievementMatch = achievementText.match(/(\d+\.?\d*)%/);
      if (!achievementMatch) {
        log.warn({ index, value: achievementText }, "Could not parse a recent play achievement");
        return;
      }
      const achievementFloat = parseFloat(achievementMatch[1]);
      const achievement = Math.round(achievementFloat * 10000);

      const dxScoreText = record.find(".playlog_score_block > .f_15").text().trim();
      const dxScoreMatch = dxScoreText.match(/(\d+(?:,\d+)?)\s*\/\s*(\d+(?:,\d+)?)/);
      if (!dxScoreMatch) {
        log.warn({ index, value: dxScoreText }, "Could not parse a recent play DX score");
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
        log.warn({ index }, "Recent play has no detail idx");
        return;
      }

      const recentSong: RecentSongData = {
        songName,
        level,
        musicType,
        difficulty,
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
    } catch (error) {
      log.error({ err: error, index }, "Could not read a recent play");
    }
  });

  log.info({ recordCount: recentSongs.length }, "Read maimai recent plays");
  return recentSongs;
}
