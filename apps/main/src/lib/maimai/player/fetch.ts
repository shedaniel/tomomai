import { logger } from "../../logger";
import { Region } from "../../types";
import { gameBaseUrl } from "@/lib/games/sites";
import { getGameHtml, requestGamePage } from "@/server/services/games/sega/http";
import type { PlayerData } from "../types";
import { parsePlayerData } from "./parse";

export async function fetchPlayerData(region: Region, cookies: string, refererUrl: string): Promise<string> {
  const playerDataUrl = `${gameBaseUrl("maimai", region)}/maimai-mobile/playerData/`;
  logger.debug(`Fetching player data from: ${playerDataUrl}`);

  const html = await getGameHtml("maimai", region, playerDataUrl, cookies, refererUrl);
  logger.debug(`Player data HTML length: ${html.length} characters`);

  if (html.includes("ERROR CODE：100001") || html.includes("Please login again")) {
    throw new Error("Session expired or invalid. Please provide a new token.");
  }

  return html;
}

export async function extractPlayerData(region: Region, html: string, cookies: string): Promise<PlayerData> {
  const { iconUpstreamUrl, ...parsed } = parsePlayerData(html, region);
  const { buffer, contentType } = await fetchIconBytes(region, iconUpstreamUrl, cookies);
  return { ...parsed, iconBytes: buffer, iconContentType: contentType };
}

async function fetchIconBytes(
  region: Region,
  imageUrl: string,
  cookies: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  logger.info(`Fetching icon bytes: ${imageUrl}`);

  const response = await requestGamePage("maimai", region, imageUrl, cookies, `${gameBaseUrl("maimai", region)}/maimai-mobile/`);

  if (!response.ok) {
    throw new Error(`Failed to fetch icon image: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/png";

  logger.debug(`Fetched icon bytes (${buffer.length} bytes, ${contentType})`);
  return { buffer, contentType };
}
