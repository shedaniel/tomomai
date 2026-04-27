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
  const parsed = parsePlayerData(html, region);
  const iconBase64 = await fetchImageAsBase64(parsed.iconUrl, cookies);
  return { ...parsed, iconBase64 };
}

export async function fetchImageAsBase64(imageUrl: string, cookies: string): Promise<string> {
  logger.info(`Fetching image for base64 encoding: ${imageUrl}`);

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

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');

  const contentType = response.headers.get('content-type') || 'image/png';
  const dataUrl = `data:${contentType};base64,${base64}`;

  logger.debug(`Image encoded as base64 (${base64.length} characters)`);
  return dataUrl;
}
