import "server-only";
import { requireGameSite } from "@/lib/games/sites";
import type { Region } from "@/lib/games/ids";
import type { GameSiteSession } from "../sega/http";
import { openSegaSession } from "../sega/login";
import { acceptSegaToken } from "../token-policy";

/** A CHUNITHM-NET session for the token, bound to its connection. */
export async function signInChunithm(region: Region, token: string, userId: string | null = null, signal?: AbortSignal): Promise<GameSiteSession> {
  requireGameSite("chunithm", region);
  const accepted = await acceptSegaToken("chunithm", userId, region, token);
  return openSegaSession("chunithm", region, userId, accepted, signal);
}
