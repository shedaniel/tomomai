import "server-only";
import { load } from "cheerio";
import type { CanonicalGameId } from "@/lib/games/types";
import { getLogger } from "@/lib/request-logger";
import { deleteToken, updateToken } from "../tokens";
import { cookieValue, gameSiteUrl, mergeCookies, requestGamePage, requestGameSite, responseCookies, segaRequestSignal, SEGA_USER_AGENT } from "./http";

export type SegaLoginConfig = { game: CanonicalGameId } & (
  | { region: "intl"; loginUrl: string; submitUrl: string; submitEncoding?: "form" }
  | { region: "jp"; submitPath: string; accountListPath: string; selectAccountPath: string; selectAccountMethod?: "POST" }
);

export interface TokenValidationResult {
  isValid: boolean;
  redirectUrl?: string;
  error?: string;
  cookies?: string;
  token?: string;
  cookiesReady?: boolean;
}

export async function processSegaToken(config: SegaLoginConfig, userId: string | null, token: string, signal?: AbortSignal): Promise<TokenValidationResult> {
  const sanitized = token.trim();
  if (sanitized.startsWith("cookie://")) {
    if (config.region !== "intl") {
      return { isValid: false, error: "Cookie format is not supported for Japan region." };
    }
    return validateSegaCookie(config, userId, sanitized.slice("cookie://".length).replace(/^clal=/, ""), true, signal);
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
    const cached = await validateSegaCookie(config, userId, cookie, false, signal);
    if (cached.isValid) return cached;
    getLogger().info({ game: config.game, region: config.region }, "Refreshing SEGA account session");
    return performAccountLogin(config, userId, username, password, signal);
  }
  return performAccountLogin(config, userId, username, password, signal);
}

async function performAccountLogin(config: SegaLoginConfig, userId: string | null, username: string, password: string, signal?: AbortSignal): Promise<TokenValidationResult> {
  const log = getLogger().child({ game: config.game, region: config.region, userId });
  let stepType = "entry";
  log.info({ stepType }, "Attempting SEGA account login");
  try {
    if (config.region === "jp") {
      const entryUrl = gameSiteUrl(config.game, config.region, "").href;
      const entry = await requestGameSite(config.game, config.region, entryUrl, { signal });
      const cookies = responseCookies(entry.headers);
      if (!cookies) {
        return { isValid: false, error: "Failed to obtain session cookies. Please try again later." };
      }
      const token = config.selectAccountMethod === "POST"
        ? load(await entry.text())("input[name=token]").attr("value")
        : cookieValue(cookies, "_t");
      if (!token) {
        return { isValid: false, error: "Failed to obtain authentication token. Please try again later." };
      }
      stepType = "credentials";
      log.info({ stepType }, "Submitting SEGA account login");
      const response = await requestGameSite(config.game, config.region, config.submitPath, {
        signal,
        method: "POST",
        headers: { Cookie: cookies, "Content-Type": "application/x-www-form-urlencoded", Referer: entryUrl },
        body: new URLSearchParams({ segaId: username, password, token }).toString(),
      });
      const redirect = response.headers.get("Location");
      if (response.status === 302 && redirect &&
        gameSiteUrl(config.game, config.region, redirect).pathname === gameSiteUrl(config.game, config.region, config.accountListPath).pathname) {
        if (config.selectAccountMethod === "POST") {
          const session = { cookies: mergeCookies(cookies, responseCookies(response.headers)) };
          stepType = "card-list";
          log.info({ stepType }, "Reading SEGA account cards");
          const accounts = await requestGamePage(config.game, config.region, redirect, session, entryUrl, { signal });
          const $ = load(await accounts.text());
          const form = $("form").filter((_, element) => $(element).find("input[name=idx]").length > 0).first();
          const fields = new URLSearchParams();
          form.find("input[type=hidden][name]").each((_, element) => fields.set($(element).attr("name")!, $(element).attr("value") ?? ""));
          const action = form.attr("action");
          if (!action || !fields.has("idx") || !fields.get("token")) throw new Error("No selectable SEGA card found");
          stepType = "card-selection";
          log.info({ stepType }, "Selecting SEGA account card");
          const selected = await requestGamePage(config.game, config.region, new URL(action, gameSiteUrl(config.game, config.region, redirect)).href, session, gameSiteUrl(config.game, config.region, redirect).href, {
            signal, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: fields.toString(),
          });
          if (selected.status !== 200) throw new Error("SEGA card selection failed");
          await selected.body?.cancel();
          return { isValid: true, cookies: session.cookies, cookiesReady: true };
        }
        return { isValid: true, redirectUrl: gameSiteUrl(config.game, config.region, config.selectAccountPath).href, cookies };
      }
    } else {
      const entry = await fetch(config.loginUrl, {
        signal: segaRequestSignal(signal),
        headers: { "User-Agent": SEGA_USER_AGENT }, redirect: "manual",
      });
      const cookies = responseCookies(entry.headers);
      if (!cookies) {
        return { isValid: false, error: "Failed to obtain session cookies. Please try again later." };
      }
      const retention = config.submitEncoding === "form" ? load(await entry.text())("input[name=retention]").attr("value") ?? "1" : "1";
      const params = new URLSearchParams({ retention, sid: username, password });
      stepType = "credentials";
      log.info({ stepType }, "Submitting SEGA account login");
      const response = await fetch(config.submitEncoding === "form" ? config.submitUrl : `${config.submitUrl}?${params}`, {
        signal: segaRequestSignal(signal),
        method: "POST", headers: { Cookie: cookies, "User-Agent": SEGA_USER_AGENT,
          ...(config.submitEncoding === "form" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        }, body: config.submitEncoding === "form" ? params.toString() : undefined, redirect: "manual",
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
    return { isValid: false, error: "Login failed. Please check your username and password." };
  } catch (err) {
    log.error({ err, stepType }, "SEGA account login failed");
    if (signal?.aborted) throw signal.reason;
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "failed";
    return { isValid: false, error: `SEGA service request ${reason} during ${stepType}. Please try again later.` };
  }
}

async function validateSegaCookie(config: Extract<SegaLoginConfig, { region: "intl" }>, userId: string | null, token: string, deleteIfFailed = true, signal?: AbortSignal): Promise<TokenValidationResult> {
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
      signal: segaRequestSignal(signal),
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
    if (signal?.aborted) throw signal.reason;
    return { isValid: false, error: "Failed to validate token. Please try again later." };
  }
}
