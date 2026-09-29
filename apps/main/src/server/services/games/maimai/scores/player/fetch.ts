import "server-only";
import { mirrorPlayerIcon } from "@/server/services/games/icons";
import type { GameSiteClient } from "@/server/services/games/sega/http";
import type { Region } from "@/lib/types";
import type { PlayerData } from "../types";
import { parsePlayerData } from "./parse";

export async function extractPlayerData(site: GameSiteClient, region: Region, html: string, signal: AbortSignal): Promise<PlayerData> {
  const { iconUpstreamUrl, ...parsed } = parsePlayerData(html, region);
  return { ...parsed, iconUrl: await mirrorPlayerIcon(site, iconUpstreamUrl, signal) };
}
