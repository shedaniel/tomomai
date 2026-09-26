import "server-only";
import type { CanonicalGameId } from "@/lib/games/types";
import { getLogger } from "@/lib/request-logger";
import { deleteToken, updateToken } from "../tokens";
import { cookieValue, gameSiteUrl, requestGameSite, responseCookies, SEGA_USER_AGENT } from "./http";

export type SegaLoginConfig = { game: CanonicalGameId } & (
  | { region: "intl"; loginUrl: string; submitUrl: string }
  | { region: "jp"; submitPath: string; accountListPath: string; selectAccountPath: string }
);

export interface TokenValidationResult {
  isValid: boolean;
  redirectUrl?: string;
  error?: string;
  cookies?: string;
  token?: string;
  cookiesReady?: boolean;
}

export async function processSegaToken(config: SegaLoginConfig, userId: string | null, token: string): Promise<TokenValidationResult> {
  const sanitized = token.trim();
  if (sanitized.startsWith("cookie://")) {
    if (config.region !== "intl") {
      return { isValid: false, error: "Cookie format is not supported for Japan region." };
    }
    return validateSegaCookie(config, userId, sanitized.slice("cookie://".length).replace(/^clal=/, ""));
  }

  const parts = sanitized.slice("account://".length).split(":://");
  if (!sanitized.startsWith("account://") || (parts.length !== 2 && parts.length !== 3)) {
    if (userId) await deleteToken(config.game, userId, config.region);
    return { isValid: false, error: "Invalid account token format. Expected account://USERNAME:://PASSWORD or account://COOKIE:://USERNAME:://PASSWORD" };
  }
  const [cookie, username, password] = parts.length === 3 ? parts : [null, ...parts];
  if (!username || !password) {
    if (userId) await deleteToken(config.game, userId, config.region);
    return { isValid: false, error: "Invalid account token format. Username and password cannot be empty." };
  }

  if (cookie && config.region === "intl") {
    const cached = await validateSegaCookie(config, userId, cookie, false);
    if (cached.isValid) return cached;
    getLogger().info({ game: config.game, region: config.region }, "Refreshing SEGA account session");
    const refreshed = await performAccountLogin(config, userId, username, password);
    if (!refreshed.isValid && userId) await deleteToken(config.game, userId, config.region);
    return refreshed;
  }
  return performAccountLogin(config, userId, username, password);
}

async function performAccountLogin(config: SegaLoginConfig, userId: string | null, username: string, password: string): Promise<TokenValidationResult> {
  const log = getLogger().child({ game: config.game, region: config.region, userId });
  log.info("Attempting SEGA account login");
  try {
    if (config.region === "jp") {
      const entryUrl = gameSiteUrl(config.game, config.region, "").href;
      const entry = await requestGameSite(config.game, config.region, entryUrl);
      const cookies = responseCookies(entry.headers);
      if (!cookies) {
        if (userId) await deleteToken(config.game, userId, config.region);
        return { isValid: false, error: "Failed to obtain session cookies. Please try again later." };
      }
      const token = cookieValue(cookies, "_t");
      if (!token) {
        if (userId) await deleteToken(config.game, userId, config.region);
        return { isValid: false, error: "Failed to obtain authentication token. Please try again later." };
      }
      const response = await requestGameSite(config.game, config.region, config.submitPath, {
        method: "POST",
        headers: { Cookie: cookies, "Content-Type": "application/x-www-form-urlencoded", Referer: entryUrl },
        body: new URLSearchParams({ segaId: username, password, token }).toString(),
      });
      const redirect = response.headers.get("Location");
      if (response.status === 302 && redirect &&
        gameSiteUrl(config.game, config.region, redirect).pathname === gameSiteUrl(config.game, config.region, config.accountListPath).pathname) {
        return { isValid: true, redirectUrl: gameSiteUrl(config.game, config.region, config.selectAccountPath).href, cookies };
      }
    } else {
      const entry = await fetch(config.loginUrl, {
        headers: { "User-Agent": SEGA_USER_AGENT }, redirect: "manual",
      });
      const cookies = responseCookies(entry.headers);
      if (!cookies) {
        if (userId) await deleteToken(config.game, userId, config.region);
        return { isValid: false, error: "Failed to obtain session cookies. Please try again later." };
      }
      const params = new URLSearchParams({ retention: "1", sid: username, password });
      const response = await fetch(`${config.submitUrl}?${params}`, {
        method: "POST", headers: { Cookie: cookies, "User-Agent": SEGA_USER_AGENT }, redirect: "manual",
      });
      if (response.status === 302) {
        const token = cookieValue(responseCookies(response.headers), "clal");
        if (!token) {
          return { isValid: false, error: "SEGA accepted your credentials but did not return a session cookie. Please try again in a few minutes or resubmit your token in Settings > Fetch." };
        }
        const redirect = response.headers.get("Location");
        if (!redirect) return { isValid: false, error: "No redirect URL received from token validation" };
        const redirectUrl = gameSiteUrl(config.game, config.region, redirect).href;
        if (userId) await updateToken(config.game, userId, config.region, `account://${token}:://${username}:://${password}`);
        return { isValid: true, redirectUrl, token };
      }
    }
    if (userId) await deleteToken(config.game, userId, config.region);
    return { isValid: false, error: "Login failed. Please check your username and password." };
  } catch (err) {
    log.error({ err }, "SEGA account login failed");
    if (userId) await deleteToken(config.game, userId, config.region);
    return { isValid: false, error: "Failed to login. Please try again later." };
  }
}

async function validateSegaCookie(config: Extract<SegaLoginConfig, { region: "intl" }>, userId: string | null, token: string, deleteIfFailed = true): Promise<TokenValidationResult> {
  const sanitized = token.trim();
  if (!/^[\x00-\x7F]*$/.test(sanitized) || !sanitized) {
    if (userId) await deleteToken(config.game, userId, config.region);
    return {
      isValid: false,
      error: sanitized ? "Invalid token format. Please ensure you copied the clal cookie correctly (ASCII characters only)." : "Token cannot be empty.",
    };
  }
  try {
    const response = await fetch(config.loginUrl, {
      headers: { Cookie: `clal=${sanitized}`, "User-Agent": SEGA_USER_AGENT }, redirect: "manual",
    });
    if (response.status === 302) {
      const redirect = response.headers.get("Location");
      if (!redirect) return { isValid: false, error: "No redirect URL received from token validation" };
      return { isValid: true, redirectUrl: gameSiteUrl(config.game, config.region, redirect).href };
    }
    if (response.status === 200) {
      if (deleteIfFailed && userId) await deleteToken(config.game, userId, config.region);
      return { isValid: false, error: "Token has expired. Please provide a new token." };
    }
    return { isValid: false, error: `Unexpected response from SEGA servers (${response.status})` };
  } catch (err) {
    getLogger().error({ err, game: config.game, region: config.region }, "SEGA cookie validation failed");
    return { isValid: false, error: "Failed to validate token. Please try again later." };
  }
}
