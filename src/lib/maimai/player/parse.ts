import { load } from "cheerio";
import { logger } from "../../logger";
import { Region, TitleType } from "../../types";
import type { PlayerData } from "../types";
import { maimaiBaseUrl } from "../http";

export function parsePlayerData(html: string, region: Region): Omit<PlayerData, "iconBase64"> {
  const $ = load(html);
  const block = $('.see_through_block');

  if (block.length === 0) {
    throw new Error("Could not find .see_through_block in player data");
  }

  // Extract icon URL
  const iconElement = block.find('img.w_112');
  if (iconElement.length === 0) {
    throw new Error("Could not find user icon in player data");
  }

  const iconSrc = iconElement.attr('src');
  if (!iconSrc) {
    throw new Error("User icon element found but src attribute is missing");
  }

  const iconUrl = iconSrc.startsWith('http') ? iconSrc : `${maimaiBaseUrl(region)}${iconSrc}`;
  logger.debug(`Extracted icon URL: ${iconUrl}`);

  // Extract display name
  const nameElement = block.find('.name_block');
  if (nameElement.length === 0) {
    throw new Error("Could not find .name_block in player data");
  }
  const displayName = nameElement.text().trim();
  logger.debug(`Extracted display name: ${displayName}`);

  // Extract rating
  const ratingElement = block.find('.rating_block');
  if (ratingElement.length === 0) {
    throw new Error("Could not find .rating_block in player data");
  }
  const ratingText = ratingElement.text().trim();
  const rating = parseInt(ratingText, 10);
  if (isNaN(rating)) {
    throw new Error(`Invalid rating format: ${ratingText}`);
  }
  logger.debug(`Extracted rating: ${rating}`);

  // Extract title and trophy type
  const titleElement = block.find('.trophy_block');
  if (titleElement.length === 0) {
    throw new Error("Could not find .trophy_block in player data");
  }
  const title = titleElement.text().trim();
  logger.debug(`Extracted title: ${title}`);

  // Extract trophy type from class (e.g., trophy_Gold -> gold)
  const titleElementClass = titleElement.attr('class') || '';
  let titleType: TitleType = "normal";
  if (titleElementClass.includes('trophy_Rainbow')) {
    titleType = "rainbow";
  } else if (titleElementClass.includes('trophy_Gold')) {
    titleType = "gold";
  } else if (titleElementClass.includes('trophy_Silver')) {
    titleType = "silver";
  } else if (titleElementClass.includes('trophy_Bronze')) {
    titleType = "bronze";
  } else if (titleElementClass.includes('trophy_Normal')) {
    titleType = "normal";
  }
  logger.debug(`Extracted trophy type: ${titleType}`);

  // Extract stars
  const starsElement = block.find('.p_l_10.f_l.f_14');
  if (starsElement.length === 0) {
    throw new Error("Could not find stars element in player data");
  }
  const starsText = starsElement.text().trim();
  // Format is ×999 or x999, extract just the number part
  const starsMatch = starsText.match(/[×x](\d+)/);
  if (!starsMatch) {
    throw new Error(`Invalid stars format: ${starsText}`);
  }
  const stars = parseInt(starsMatch[1], 10);
  logger.debug(`Extracted stars: ${stars} (from text: ${starsText})`);

  // Extract play counts
  const playCountElement = block.find('.t_r.f_12');
  if (playCountElement.length === 0) {
    throw new Error("Could not find play count element in player data");
  }
  const playCountText = playCountElement.text().trim();
  logger.debug(`Play count text: ${playCountText}`);

  const playCountRegex =
    region === "jp" ? /現バージョンプレイ回数[：:]\s*([\d,]+)/
    : region === "cn" ? /当前版本的游玩次数[：:]\s*([\d,]+)/
    : /play count of current version[：:]\s*([\d,]+)/;
  const totalPlayCountRegex =
    region === "jp" ? /累計プレイ回数[：:]\s*([\d,]+)/
    : region === "cn" ? /舞萌DX的累计游玩次数[：:]\s*([\d,]+)/
    : /maimaiDX total play count[：:]\s*([\d,]+)/;

  // Parse version play count: "play count of current version：195"
  const versionPlayCountMatch = playCountText.match(playCountRegex);
  if (!versionPlayCountMatch) {
    throw new Error(`Could not parse version play count from: ${playCountText}`);
  }
  const versionPlayCount = parseInt(versionPlayCountMatch[1].replace(/,/g, ''), 10);

  // Parse total play count: "maimaiDX total play count：909"
  const totalPlayCountMatch = playCountText.match(totalPlayCountRegex);
  if (!totalPlayCountMatch) {
    throw new Error(`Could not parse total play count from: ${playCountText}`);
  }
  const totalPlayCount = parseInt(totalPlayCountMatch[1].replace(/,/g, ''), 10);

  logger.debug(`Extracted version play count: ${versionPlayCount}`);
  logger.debug(`Extracted total play count: ${totalPlayCount}`);

  // Extract course rank and class rank images
  const rankElements = block.find('.h_35.f_l');
  if (rankElements.length < 2) {
    throw new Error(`Expected 2 rank elements, found ${rankElements.length}`);
  }

  // Course rank (first element) - the element itself is an img
  const courseRankSrc = rankElements.eq(0).attr('src');
  if (!courseRankSrc) {
    throw new Error("Course rank image src attribute is missing");
  }
  const courseRankUrl = courseRankSrc.startsWith('http') ? courseRankSrc : `https://maimaidx-eng.com${courseRankSrc}`;
  logger.debug(`Extracted course rank URL: ${courseRankUrl}`);

  // Class rank (second element) - the element itself is an img
  const classRankSrc = rankElements.eq(1).attr('src');
  if (!classRankSrc) {
    throw new Error("Class rank image src attribute is missing");
  }
  const classRankUrl = classRankSrc.startsWith('http') ? classRankSrc : `https://maimaidx-eng.com${classRankSrc}`;
  logger.debug(`Extracted class rank URL: ${classRankUrl}`);

  return {
    iconUrl,
    displayName,
    rating,
    title,
    titleType,
    stars,
    versionPlayCount,
    totalPlayCount,
    courseRankUrl,
    classRankUrl,
  };
}
