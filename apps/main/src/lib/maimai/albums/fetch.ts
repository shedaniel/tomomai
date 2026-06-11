import { load } from "cheerio";
import { logger } from "../../logger";
import { normalizeName } from "@tomomai/catalog/name-utils";
import { Difficulty, Region, SongType } from "../../types";
import { maimaiBaseUrl, maimaiGetHtml } from "@tomomai/server/maimai-http";
import { musicTypeFromIcon } from "@tomomai/catalog/parse-utils";
import type { AlbumData } from "../types";

export async function fetchAlbumData(cookies: string, region: Region): Promise<AlbumData[]> {
  const baseUrl = maimaiBaseUrl(region);
  const albumUrl = `${baseUrl}/maimai-mobile/playerData/photo/`;
  logger.info(`Fetching album data from: ${albumUrl}`);

  const albumHtml = await maimaiGetHtml(albumUrl, cookies, `${baseUrl}/maimai-mobile/`);
  logger.debug(`Album data fetched successfully, length: ${albumHtml.length} characters`);

  const $ = load(albumHtml);
  const albums: AlbumData[] = [];

  const blocks = $(".m_10.p_5.f_0");
  logger.debug(`Found ${blocks.length} album blocks`);

  blocks.each((index, element) => {
    try {
      const block = $(element);

      const songNameBlock = block.find(".black_block");
      if (songNameBlock.length === 0) {
        logger.warn(`No song name block found for album ${index}`);
        return;
      }
      const songName = normalizeName(songNameBlock.text().trim());
      if (!songName) {
        logger.warn(`Could not extract song name for album ${index}`);
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
        logger.warn(`Could not parse takenAt from: ${takenAtText} for album ${index}`);
        return;
      }
      const [, year, month, day, hour, minute] = takenAtMatch;
      const takenAt = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);

      const imageElement = block.find("img.w_430");
      let imageUrl = "";
      if (imageElement.length > 0) {
        const imageSrc = imageElement.attr("src");
        if (imageSrc) {
          imageUrl = imageSrc.startsWith("http") ? imageSrc : `${baseUrl}${imageSrc}`;
        }
      }
      if (!imageUrl) {
        logger.warn(`Could not extract image URL for album ${index}`);
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

      logger.debug(`Extracted album ${index}: ${songName} (${difficulty}, ${musicType}) at ${takenAt.toISOString()}`);
    } catch (error) {
      logger.error(error, `Error processing album block ${index}`);
    }
  });

  logger.info(`Successfully extracted ${albums.length} albums`);
  return albums;
}
