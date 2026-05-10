import { AGENT } from "../../http-agent";
import { logger } from "../../logger";
import { Region } from "../../types";
import { maimaiBaseUrl, maimaiGetHtml } from "../http";
import type { PlayerData } from "../types";
import { parsePlayerData } from "./parse";

export async function fetchPlayerData(region: Region, cookies: string, refererUrl: string): Promise<string> {
  const playerDataUrl = `${maimaiBaseUrl(region)}/maimai-mobile/playerData/`;
  logger.debug(`Fetching player data from: ${playerDataUrl}`);

  const html = await maimaiGetHtml(playerDataUrl, cookies, refererUrl);
  logger.debug(`Player data HTML length: ${html.length} characters`);

  if (html.includes("ERROR CODE：100001") || html.includes("Please login again")) {
    throw new Error("Session expired or invalid. Please provide a new token.");
  }

  return html;
}

export async function extractPlayerData(region: Region, html: string, cookies: string): Promise<PlayerData> {
  const { iconUpstreamUrl, ...parsed } = parsePlayerData(html, region);
  const { buffer, contentType } = await fetchIconBytes(iconUpstreamUrl, cookies);
  return { ...parsed, iconBytes: buffer, iconContentType: contentType };
}

export async function fetchIconBytes(
  imageUrl: string,
  cookies: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  logger.info(`Fetching icon bytes: ${imageUrl}`);

  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Cookie": cookies || "",
    },
    ...{ dispatcher: AGENT },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch icon image: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/png";

  logger.debug(`Fetched icon bytes (${buffer.length} bytes, ${contentType})`);
  return { buffer, contentType };
}
