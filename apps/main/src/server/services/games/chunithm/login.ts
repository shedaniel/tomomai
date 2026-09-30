import "server-only";
import { requireGameSite } from "@/lib/games/sites";
import type { Region } from "@/lib/games/ids";
import { openSegaSession } from "../sega/login";
import { acceptSegaToken } from "../token-policy";

export async function loginAndGetCookies(region: Region, token: string, userId: string | null = null, signal?: AbortSignal): Promise<string> {
  requireGameSite("chunithm", region);
  const accepted = await acceptSegaToken("chunithm", userId, region, token);
  return (await openSegaSession("chunithm", region, userId, accepted, signal)).cookies;
}
