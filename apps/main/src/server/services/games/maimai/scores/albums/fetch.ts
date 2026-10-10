import "server-only";
import { load } from "cheerio";
import { normalizeName } from "@/lib/name-utils";
import { getLogger } from "@/lib/request-logger";
import type { Difficulty, SongType } from "@/lib/games/maimai/types";
import { siteRoot } from "@/lib/games/sites";
import type { Region } from "@/lib/games/ids";
import type { GameSiteClient } from "@/server/services/games/sega/http";
import { musicTypeFromIcon } from "../parse-utils";
import type { AlbumData } from "../types";

export async function fetchAlbumData(site: GameSiteClient, region: Region): Promise<AlbumData[]> {
  const log = getLogger();
  const albumHtml = await site.html("playerData/photo/");
  const root = siteRoot("maimai", region);

  const $ = load(albumHtml);
  const albums: AlbumData[] = [];

  const blocks = $(".m_10.p_5.f_0");
  blocks.each((index, element) => {
    try {
      const block = $(element);

      const songNameBlock = block.find(".black_block");
      if (songNameBlock.length === 0) {
        log.warn({ index }, "Album has no song name block");
        return;
      }
      const songName = normalizeName(songNameBlock.text().trim());
      if (!songName) {
        log.warn({ index }, "Album has an empty song name");
        return;
      }

      const diffElement = block.find(".p_r");
      const diffClassName = diffElement.attr("class") || "";
      let difficulty: Difficulty = "basic";

      if (diffClassName.includes("utage")) {
        difficulty = "utage";
      } else if (diffClassName.includes("remaster")) {
        difficulty = "remaster";
      } else if (diffClassName.includes("master")) {
        difficulty = "master";
      } else if (diffClassName.includes("expert")) {
        difficulty = "expert";
      } else if (diffClassName.includes("advanced")) {
        difficulty = "advanced";
      } else if (diffClassName.includes("basic")) {
        difficulty = "basic";
      }

      const musicKindIcon = block.find(".music_kind_icon");
      const musicType: SongType = difficulty === "utage"
        ? "dx"
        : (musicTypeFromIcon(musicKindIcon.attr("src")) ?? "std");

      const blockInfo = block.find(".block_info");
      const takenAtText = blockInfo.text().trim();
      const takenAtMatch = takenAtText.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
      if (!takenAtMatch) {
        log.warn({ index, value: takenAtText }, "Could not parse the album time");
        return;
      }
      const [, year, month, day, hour, minute] = takenAtMatch;
      const takenAt = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);

      const imageElement = block.find("img.w_430");
      let imageUrl = "";
      if (imageElement.length > 0) {
        const imageSrc = imageElement.attr("src");
        if (imageSrc) {
          imageUrl = new URL(imageSrc, root).href;
        }
      }
      if (!imageUrl) {
        log.warn({ index }, "Album has no image");
        return;
      }

      const venueBlock = block.find(".see_through_block");
      const venue = venueBlock.length > 0 ? venueBlock.text().trim() || null : null;

      albums.push({
        songName,
        musicType,
        difficulty,
        takenAt,
        imageUrl,
        venue,
      });
    } catch (error) {
      log.error({ err: error, index }, "Could not read an album");
    }
  });

  log.info({ count: albums.length }, "Read maimai albums");
  return albums;
}
