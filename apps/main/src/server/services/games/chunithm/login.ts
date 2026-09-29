import "server-only";
import { requireGameSite } from "@/lib/games/sites";
import type { Region } from "@/lib/types";
import { gameSiteUrl, requestGamePage } from "../sega/http";
import { processSegaToken } from "../sega/login";
import { chunithmSegaLogin } from "./login-config";

export async function loginAndGetCookies(region: Region, token: string, userId: string | null = null, signal?: AbortSignal): Promise<string> {
  requireGameSite("chunithm", region);
  const result = await processSegaToken(chunithmSegaLogin[region], userId, token, signal);
  if (!result.isValid) throw new Error(result.error ?? "CHUNITHM login failed");
  if (result.cookiesReady && result.cookies) return result.cookies;
  if (!result.redirectUrl) throw new Error("CHUNITHM login did not return a game session");
  const session = { cookies: result.cookies ?? "" };
  const response = await requestGamePage("chunithm", region, result.redirectUrl, session, gameSiteUrl("chunithm", region, "").href, { signal });
  if (response.status !== 200 || !session.cookies) throw new Error("CHUNITHM login did not return a game session");
  return session.cookies;
}
