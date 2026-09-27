import "server-only";
import { agentFetch } from "@/lib/http-agent";
import { getGameSite } from "@/lib/games/sites";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Region } from "@/lib/types";
import { getLogger } from "@/lib/request-logger";

export const SEGA_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

export function gameSiteUrl(game: CanonicalGameId, region: Region, path: string): URL {
  const site = getGameSite(game, region);
  if (!site) throw new Error(`No game site configured for ${game}/${region}`);
  const url = new URL(path, site.entryUrl);
  if (url.origin !== new URL(site.entryUrl).origin) {
    throw new Error(`Unexpected game site origin for ${game}/${region}`);
  }
  return url;
}

export function responseCookies(headers: Headers): string {
  const values = headers.getSetCookie ? headers.getSetCookie() : [headers.get("set-cookie") ?? ""];
  return values.map(value => value.split(";")[0]).filter(Boolean).join("; ");
}

export function mergeCookies(current: string, incoming: string): string {
  const cookies = new Map<string, string>();
  for (const cookie of `${current}; ${incoming}`.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator >= 0) cookies.set(cookie.slice(0, separator).trim(), cookie.slice(separator + 1));
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

export interface GameSiteSession { cookies: string }

export function cookieValue(cookies: string, name: string): string | undefined {
  const prefix = `${name}=`;
  return cookies.split(";").map(value => value.trim()).find(value => value.startsWith(prefix))?.slice(prefix.length);
}

export function segaRequestSignal(signal?: AbortSignal | null): AbortSignal {
  const timeout = AbortSignal.timeout(30_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function requestGameSite(game: CanonicalGameId, region: Region, path: string, init: RequestInit = {}): Promise<Response> {
  const url = gameSiteUrl(game, region, path);
  const headers = new Headers(init.headers);
  headers.set("User-Agent", SEGA_USER_AGENT);
  // Keep maimai's existing TLS compatibility handling scoped to its own sites.
  const fetchSite = game === "maimai" ? agentFetch : fetch;
  return fetchSite(url, { ...init, signal: segaRequestSignal(init.signal), headers, redirect: "manual" });
}

export async function requestGamePage(game: CanonicalGameId, region: Region, url: string, cookies: string | GameSiteSession, referer: string, init: RequestInit = {}): Promise<Response> {
  url = gameSiteUrl(game, region, url).href;
  const session = typeof cookies === "string" ? { cookies } : cookies;
  let request = init;
  for (let redirects = 0; redirects <= 10; redirects++) {
    const headers = new Headers(request.headers);
    headers.set("Cookie", session.cookies);
    headers.set("Referer", referer);
    const response = await requestGameSite(game, region, url, { ...request, headers });
    session.cookies = mergeCookies(session.cookies, responseCookies(response.headers));
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("Location");
    if (!location) return response;
    await response.body?.cancel();
    url = new URL(location, url).href;
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && request.method === "POST")) {
      request = { signal: init.signal };
    }
  }
  throw new Error("Too many game site redirects");
}

export async function getGamePage(game: CanonicalGameId, region: Region, url: string, cookies: string, referer: string): Promise<Response> {
  const response = await requestGamePage(game, region, url, cookies, referer);
  if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${url}`);
  return response;
}

export async function getGameHtml(game: CanonicalGameId, region: Region, url: string, cookies: string, referer: string): Promise<string> {
  return (await getGamePage(game, region, url, cookies, referer)).text();
}

export async function getCookiesFromRedirect(game: CanonicalGameId, region: Region, redirectUrl: string, cookies: string | null): Promise<string> {
  const response = await requestGameSite(game, region, redirectUrl, {
    headers: cookies ? { Cookie: cookies } : undefined,
  });
  const sessionCookies = responseCookies(response.headers);
  if (!sessionCookies) {
    getLogger().warn({ game, region, status: response.status }, "No cookies received from login redirect");
    throw new Error(`No cookies received from login redirect (status ${response.status})`);
  }
  return sessionCookies;
}
