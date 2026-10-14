import "server-only";
import { agentFetch } from "@/lib/http-agent";
import { getGame } from "@/lib/games/registry";
import { getGameSite, siteOrigin, siteRoot, siteUrl } from "@/lib/games/sites";
import type { CanonicalGameId, Region } from "@/lib/games/ids";

export const SEGA_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

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

/** One request to a game site, without following redirects. A path resolves against the site's mobile root. */
export function requestGameSite(game: CanonicalGameId, region: Region, path: string, init: RequestInit = {}): Promise<Response> {
  const url = siteUrl(game, region, path);
  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", SEGA_USER_AGENT);
  const fetchSite = getGameSite(game, region)?.legacyTls ? agentFetch : fetch;
  return fetchSite(url, { ...init, signal: segaRequestSignal(init.signal), headers, redirect: "manual" });
}

/** Follows redirects on the site with the session. A redirect to another origin is returned as `offsite`, not followed. */
async function followGameSite(game: CanonicalGameId, region: Region, url: string, session: GameSiteSession, referer: string, init: RequestInit): Promise<{ response: Response; url: string; offsite?: URL }> {
  const origin = siteOrigin(game, region);
  let request = init;
  for (let redirects = 0; redirects <= 10; redirects++) {
    const headers = new Headers(request.headers);
    headers.set("Cookie", session.cookies);
    headers.set("Referer", referer);
    const response = await requestGameSite(game, region, url, { ...request, headers });
    session.cookies = mergeCookies(session.cookies, responseCookies(response.headers));
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, url };
    const location = response.headers.get("Location");
    if (!location) return { response, url };
    await response.body?.cancel();
    const next = new URL(location, url);
    if (next.origin !== origin) return { response, url, offsite: next };
    url = next.href;
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && request.method === "POST")) {
      request = { signal: init.signal };
    }
  }
  throw new Error("Too many game site redirects");
}

type SiteBytes = { buffer: Buffer; contentType: string };

export interface GameSiteClient {
  /** The last page read, sent as the Referer of the next request. */
  readonly pageUrl: string;
  /** GETs a page relative to the mobile root. */
  html(path: string): Promise<string>;
  /** POSTs a form to a path relative to the mobile root. */
  post(path: string, fields: URLSearchParams): Promise<string>;
  /** Downloads a file, through the session on the site's origin and without cookies elsewhere. */
  bytes(url: string): Promise<SiteBytes>;
}

type GameSiteOptions = {
  signal?: AbortSignal;
  /** Rejects a 200 page that is not what was asked for, such as a sign-in page. */
  assertPage?: (html: string, url: string) => void;
  /** The page the session continues from, sent as the first Referer. Defaults to the mobile root. */
  pageUrl?: string;
};

async function readBytes(response: Response, url: URL): Promise<SiteBytes> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`${url.host}${url.pathname} returned HTTP ${response.status}`);
  }
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? "image/png" };
}

/** Downloads files that need no game session, such as a provider's public assets. */
export function openPublicAssets(signal?: AbortSignal): Pick<GameSiteClient, "bytes"> {
  return {
    async bytes(url) {
      const target = new URL(url);
      return readBytes(await fetch(target, { signal: segaRequestSignal(signal) }), target);
    },
  };
}

/** A game site session that follows same-origin redirects and keeps the cookies each response sets. */
export function openGameSite(game: CanonicalGameId, region: Region, session: GameSiteSession, { signal, assertPage, pageUrl: startUrl }: GameSiteOptions = {}): GameSiteClient {
  const root = siteRoot(game, region);
  const publicAssets = openPublicAssets(signal);
  let pageUrl = startUrl ?? root.href;

  async function page(path: string, init: RequestInit): Promise<string> {
    const { response, url, offsite } = await followGameSite(game, region, siteUrl(game, region, path).href, session, pageUrl, { ...init, signal });
    if (offsite) throw new Error(`Unexpected game site origin for ${game}/${region}`);
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error(`${getGame(game).brand.displayName} page ${new URL(url).pathname} returned HTTP ${response.status}`);
    }
    const html = await response.text();
    pageUrl = url;
    assertPage?.(html, url);
    return html;
  }

  return {
    get pageUrl() { return pageUrl; },
    html: path => page(path, {}),
    post: (path, fields) => page(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: fields.toString(),
    }),
    async bytes(url) {
      const target = new URL(url, root);
      if (target.origin !== root.origin) return publicAssets.bytes(target.href);
      const { response, offsite } = await followGameSite(game, region, target.href, session, pageUrl, { signal });
      return offsite ? publicAssets.bytes(offsite.href) : readBytes(response, target);
    },
  };
}
