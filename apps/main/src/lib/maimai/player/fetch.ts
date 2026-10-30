import { logger } from "../../logger";
import { Region } from "../../types";
import { maimaiBaseUrl, maimaiGetHtml, maimaiImageRequest } from "../http";
import type { PlayerData } from "../types";
import { parsePlayerData } from "./parse";

export async function fetchPlayerData(region: Region, cookies: string, refererUrl: string): Promise<string> {
  const playerDataUrl = `${maimaiBaseUrl(region)}/maimai-mobile/playerData/`;
  logger.debug(`Fetching player data from: ${playerDataUrl}`);

  const html = await maimaiGetHtml(playerDataUrl, cookies, refererUrl);
  logger.debug(`Player data HTML length: ${html.length} characters`);

  if (!html.includes("see_through_block")) {
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    logger.warn({ url: playerDataUrl, size: html.length }, `Player page has no profile content: ${title} | ${text.slice(0, 200)}`);
  }

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

  const response = await maimaiImageRequest(imageUrl, cookies || "");

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok || buffer.length === 0) {
    throw new Error(`Failed to fetch icon image: HTTP ${response.status}, ${buffer.length} bytes`);
  }

  const contentType = response.headers.get("content-type") || "image/png";

  logger.debug(`Fetched icon bytes (${buffer.length} bytes, ${contentType})`);
  return { buffer, contentType };
}
