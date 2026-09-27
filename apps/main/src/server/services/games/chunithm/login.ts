import "server-only";
import type { Region } from "@/lib/types";
import { gameSiteUrl, requestGamePage } from "../sega/http";
import { processSegaToken } from "../sega/login";
import { chunithmSegaLogin } from "./login-config";

export async function loginAndGetCookies(region: Region, token: string, userId: string | null = null): Promise<string> {
  if (region !== "jp" && region !== "intl") throw new Error("CHUNITHM player fetching supports JP and International only");
  const result = await processSegaToken(chunithmSegaLogin[region], userId, token);
  if (!result.isValid) throw new Error(result.error ?? "CHUNITHM login failed");
  if (result.cookiesReady && result.cookies) return result.cookies;
  if (!result.redirectUrl) throw new Error("CHUNITHM login did not return a game session");
  const session = { cookies: result.cookies ?? "" };
  const response = await requestGamePage("chunithm", region, result.redirectUrl, session, gameSiteUrl("chunithm", region, "").href);
  if (response.status !== 200 || !session.cookies) throw new Error("CHUNITHM login did not return a game session");
  return session.cookies;
}
