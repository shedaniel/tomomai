import "server-only";
import { load } from "cheerio";
import type { Agent } from "undici";
import { agentFetch, createPinnedAgent } from "@/lib/http-agent";
import { logger } from "@/lib/logger";
import { getGame } from "@/lib/games/registry";
import { getGameSite, siteOrigin, siteRoot, siteUrl } from "@/lib/games/sites";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { budgetedSite, markSiteLocked, takeSiteRequest } from "./budget";
import { GameSiteLockedError, isThrottlingError } from "./errors";

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

/** The cookies in `after` that are new or changed since `before`. */
function changedCookies(before: string, after: string): string {
  const previous = new Map(before.split(";").map(cookie => cookie.trim()).filter(Boolean).map(cookie => [cookie.split("=")[0], cookie]));
  return after.split(";").map(cookie => cookie.trim()).filter(cookie => cookie && previous.get(cookie.split("=")[0]) !== cookie).join("; ");
}

export function cookieValue(cookies: string, name: string): string | undefined {
  const prefix = `${name}=`;
  return cookies.split(";").map(value => value.trim()).find(value => value.startsWith(prefix))?.slice(prefix.length);
}

export function segaRequestSignal(signal?: AbortSignal | null): AbortSignal {
  const timeout = AbortSignal.timeout(30_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

// The rate-limit lock; see GameSiteLockedError.
const LOCKED_ERROR_CODE = "200001";

/** SEGA's error page: "ERROR CODE：200002" plus a human-readable reason. */
export function describeSegaError(html: string): { code?: string; message?: string } {
  const code = html.match(/ERROR CODE[：:]\s*(\d+)/)?.[1];
  if (!code) return {};
  const $ = load(html.replace(/<br\s*\/?>/gi, " "));
  const message = $(".container_red .break").first().text().replace(/\s+/g, " ").trim();
  return { code, message: message || undefined };
}

function formatSegaError({ code, message }: { code?: string; message?: string }): string {
  if (!code) return "";
  return ` ERROR CODE ${code}${message ? `: ${message}` : ""}`;
}

function netName(game: CanonicalGameId): string {
  return getGame(game).brand.netName;
}

function lockedOut(game: CanonicalGameId, url: string): GameSiteLockedError {
  void markSiteLocked(url);
  return new GameSiteLockedError(game);
}

function isErrorPage(game: CanonicalGameId, region: Region, url: string): boolean {
  return new URL(url).pathname === siteUrl(game, region, "error/").pathname;
}

function pinnedAgent(game: CanonicalGameId, region: Region): Agent {
  return createPinnedAgent({ verifyTls: !getGameSite(game, region)?.legacyTls });
}

/**
 * One request to a game site, without following redirects. A path resolves against the site's mobile root.
 * It takes a slot from the site's shared request budget first, and goes out on `agent` when one is given.
 */
export async function requestGameSite(game: CanonicalGameId, region: Region, path: string, init: RequestInit = {}, agent?: Agent): Promise<Response> {
  const url = siteUrl(game, region, path);
  await takeSiteRequest(url.href);
  init.signal?.throwIfAborted();
  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", SEGA_USER_AGENT);
  const request = { ...init, signal: segaRequestSignal(init.signal), headers, redirect: "manual" } as const;
  if (agent) return agentFetch(url, request, agent);
  return getGameSite(game, region)?.legacyTls ? agentFetch(url, request) : fetch(url, request);
}

type CookieJar = { cookies: string };

/** Follows redirects on the site with the session. A redirect to another origin is returned as `offsite`, not followed. */
async function followGameSite(game: CanonicalGameId, region: Region, url: string, jar: CookieJar, referer: string, init: RequestInit, agent?: Agent): Promise<{ response: Response; url: string; offsite?: URL }> {
  const origin = siteOrigin(game, region);
  let request = init;
  for (let redirects = 0; redirects <= 10; redirects++) {
    const headers = new Headers(request.headers);
    headers.set("Cookie", jar.cookies);
    headers.set("Referer", referer);
    const response = await requestGameSite(game, region, url, { ...request, headers }, agent);
    jar.cookies = mergeCookies(jar.cookies, responseCookies(response.headers));
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

/** A followed request with its body read, so a rejection (even an empty 200) can be told apart and the connection is free again. */
type SiteResult = { status: number; url: string; offsite?: URL; body: Buffer; contentType: string | null };

async function fetchSite(game: CanonicalGameId, region: Region, url: string, jar: CookieJar, referer: string, init: RequestInit, agent?: Agent): Promise<SiteResult> {
  const { response, url: finalUrl, offsite } = await followGameSite(game, region, url, jar, referer, init, agent);
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, url: finalUrl, offsite, body, contentType: response.headers.get("content-type") };
}

type RequestKind = "page" | "file";

/** Whether the site turned the request away: a missing file, an empty body, its error page or, for a page, a sign-in elsewhere. */
function isRejected(game: CanonicalGameId, region: Region, result: SiteResult, kind: RequestKind): boolean {
  if (result.offsite) return kind === "page";
  return result.status === 404 || isErrorPage(game, region, result.url) || (result.status === 200 && result.body.length === 0);
}

function sessionRejected(game: CanonicalGameId, region: Region, result: SiteResult): boolean {
  return Boolean(result.offsite) || isErrorPage(game, region, result.url);
}

// SEGA binds a session to the network of the connection that started it, and
// starting it again replaces the previous session. A session keeps that
// connection as its primary, spreads requests over the helper connections its
// site allows until one is rejected, and starts again on a fresh connection if
// the session itself is rejected. Files missing on the primary's server are
// retried through throwaway connections.
const MAX_ATTEMPTS = 6;
const MAX_REDEEMS = 3;
const SESSION_IDLE_MS = 5 * 60_000;

/** The request that started a session, which starts it again when replayed on a fresh connection. */
export type SessionRedemption = { url: string; cookies: string; referer?: string };

interface SessionConnections {
  game: CanonicalGameId;
  region: Region;
  primary: Agent;
  // undefined: not opened yet; null: retired after the site rejected a request on it.
  helpers: (Agent | null | undefined)[];
  next: number;
  redemption?: SessionRedemption;
  redeems: number;
  redeeming: Promise<void> | null;
  released: boolean;
  locked: GameSiteLockedError | null;
  timer: NodeJS.Timeout;
}

export interface GameSiteSession {
  cookies: string;
  /** The connections a signed-in session is bound to. Without them, each request opens its own. */
  connections?: SessionConnections;
}

function bindConnections(game: CanonicalGameId, region: Region, session: GameSiteSession, primary: Agent, redemption?: SessionRedemption): GameSiteSession {
  const helperCount = (getGameSite(game, region)?.sessionConnections ?? 1) - 1;
  const connections: SessionConnections = {
    game,
    region,
    primary,
    helpers: Array.from({ length: helperCount }, () => undefined),
    next: 0,
    redemption,
    redeems: redemption ? 1 : 0,
    redeeming: null,
    released: false,
    locked: null,
    timer: setTimeout(() => releaseGameSiteSession(session), SESSION_IDLE_MS),
  };
  connections.timer.unref();
  session.connections = connections;
  return session;
}

/**
 * Closes the session's connections once their in-flight requests finish, and makes any request still
 * running for it fail instead of retrying. A session that sits idle is released on its own.
 */
export function releaseGameSiteSession(session: GameSiteSession): void {
  const connections = session.connections;
  if (!connections || connections.released) return;
  connections.released = true;
  clearTimeout(connections.timer);
  void connections.primary.close();
  for (const helper of connections.helpers) if (helper) void helper.close();
}

// Reads the error page a redemption was sent to, once, and throws what it says.
async function throwRedemptionError(game: CanonicalGameId, region: Region, agent: Agent, errorUrl: string, cookies: string): Promise<never> {
  const page = await requestGameSite(game, region, errorUrl, { headers: { Cookie: cookies } }, agent);
  const error = describeSegaError(await page.text());
  logger.warn({ url: errorUrl, status: page.status }, `${netName(game)} refused the login redirect${formatSegaError(error)}`);
  if (error.code === LOCKED_ERROR_CODE) throw lockedOut(game, errorUrl);
  throw new Error(`${netName(game)} refused the login redirect${formatSegaError(error) || " (redirected to its error page)"}`);
}

async function redeem(game: CanonicalGameId, region: Region, { url, cookies, referer }: SessionRedemption, signal?: AbortSignal): Promise<{ agent: Agent; cookies: string }> {
  for (let attempt = 1; ; attempt++) {
    const agent = pinnedAgent(game, region);
    let response: Response;
    try {
      const headers = new Headers({ Referer: referer ?? siteRoot(game, region).href });
      if (cookies) headers.set("Cookie", cookies);
      response = await requestGameSite(game, region, url, { signal, headers }, agent);
      await response.arrayBuffer();
    } catch (error) {
      void agent.close();
      throw error;
    }

    const set = responseCookies(response.headers);
    const names = set ? set.split("; ").map(cookie => cookie.split("=")[0]) : [];
    const location = response.headers.get("Location");
    const target = location ? new URL(location, url) : null;
    logger.info({ region, status: response.status, count: names.length }, `Redeemed ${netName(game)} login redirect -> ${target?.pathname ?? "-"} (cookies: ${names.join(", ") || "none"})`);
    if (target && target.origin === siteOrigin(game, region) && isErrorPage(game, region, target.href)) {
      try {
        await throwRedemptionError(game, region, agent, target.href, mergeCookies(cookies, set));
      } finally {
        void agent.close();
      }
    }
    if (set && response.status !== 404) return { agent, cookies: mergeCookies(cookies, set) };

    void agent.close();
    // A redemption that set no cookies started no session, so it is safe to retry.
    if (attempt >= MAX_ATTEMPTS) {
      throw new Error(`${netName(game)} did not start a session (status ${response.status})`);
    }
  }
}

/**
 * Starts a session by sending `redemption` (a sign-in's callback or card selection) on a connection of its
 * own, and binds the session to that connection, so it can be started again if the site rejects it.
 */
export async function redeemGameSession(game: CanonicalGameId, region: Region, redemption: SessionRedemption, signal?: AbortSignal): Promise<GameSiteSession> {
  const { agent, cookies } = await redeem(game, region, redemption, signal);
  return bindConnections(game, region, { cookies }, agent, redemption);
}

/** Binds a session whose start cannot be replayed to a connection of its own, so its next requests start it there. */
export function pinGameSession(game: CanonicalGameId, region: Region, session: GameSiteSession): GameSiteSession {
  return bindConnections(game, region, session, pinnedAgent(game, region));
}

function nextAgent(connections: SessionConnections): Agent {
  const slot = connections.next++ % (connections.helpers.length + 1);
  if (slot === 0) return connections.primary;
  const helper = connections.helpers[slot - 1];
  if (helper === null) return connections.primary;
  return (connections.helpers[slot - 1] ??= pinnedAgent(connections.game, connections.region));
}

function retireHelper(connections: SessionConnections, helper: Agent): void {
  const slot = connections.helpers.indexOf(helper);
  if (slot === -1) return;
  connections.helpers[slot] = null;
  void helper.close();
}

async function recoverPrimary(session: GameSiteSession, connections: SessionConnections, failed: Agent): Promise<boolean> {
  if (connections.primary !== failed) return true;
  if (!connections.redeeming) {
    const { redemption } = connections;
    if (!redemption || connections.redeems >= MAX_REDEEMS) return false;
    connections.redeems++;
    logger.warn({ region: connections.region, count: connections.redeems }, `${netName(connections.game)} rejected the session, redeeming the login redirect again`);
    connections.redeeming = redeem(connections.game, connections.region, redemption)
      .then(({ agent, cookies }) => {
        if (connections.released) {
          void agent.close();
          return;
        }
        const old = connections.primary;
        connections.primary = agent;
        session.cookies = cookies;
        void old.close();
      })
      .catch((error: unknown) => {
        if (error instanceof GameSiteLockedError) connections.locked ??= error;
        throw error;
      })
      .finally(() => {
        connections.redeeming = null;
      });
  }
  await connections.redeeming;
  return true;
}

async function sessionRequest(session: GameSiteSession, connections: SessionConnections, url: string, referer: string, init: RequestInit, kind: RequestKind): Promise<SiteResult> {
  const { game, region } = connections;
  let route: "pool" | "primary" | "throwaway" = "pool";
  for (let attempt = 1; ; attempt++) {
    if (connections.locked) throw connections.locked;
    if (connections.redeeming) await connections.redeeming;
    if (connections.locked) throw connections.locked;
    if (connections.released) throw new Error(`${netName(game)} session was released`);
    connections.timer.refresh();

    const agent = route === "pool" ? nextAgent(connections) : route === "primary" ? connections.primary : pinnedAgent(game, region);
    const via = agent === connections.primary ? "primary" : route === "throwaway" ? "throwaway" : "helper";
    const isLastAttempt = attempt >= MAX_ATTEMPTS;

    // A rejected response (an error page, another network's backend) must not change the session's cookies.
    const referenceCookies = session.cookies;
    const jar = { cookies: referenceCookies };
    let result: SiteResult;
    try {
      result = await fetchSite(game, region, url, jar, referer, init, agent);
    } catch (error) {
      if (error instanceof GameSiteLockedError) connections.locked ??= error;
      if (connections.locked) throw connections.locked;
      if (isThrottlingError(error) || init.signal?.aborted || connections.released || isLastAttempt) throw error;
      logger.warn({ err: error, url }, `${netName(game)} request failed on the ${via} connection, retrying`);
      if (via === "helper") retireHelper(connections, agent);
      route = "primary";
      continue;
    } finally {
      if (via === "throwaway") void agent.close();
    }

    if (!isRejected(game, region, result, kind)) {
      if (via !== "throwaway") session.cookies = mergeCookies(session.cookies, changedCookies(referenceCookies, jar.cookies));
      return result;
    }

    const reason = describeSegaError(result.body.toString());
    const size = result.body.length;
    if (reason.code === LOCKED_ERROR_CODE) {
      logger.warn({ url, status: result.status, size }, `${netName(game)} locked the connection, not retrying${formatSegaError(reason)}`);
      connections.locked ??= lockedOut(game, url);
      throw connections.locked;
    }
    if (isLastAttempt) return result;

    logger.warn({ url, status: result.status, size }, `${netName(game)} rejected the request on the ${via} connection, retrying${formatSegaError(reason)}`);
    if (via === "helper") {
      retireHelper(connections, agent);
      route = "primary";
    } else if (via === "primary" && sessionRejected(game, region, result)) {
      if (!(await recoverPrimary(session, connections, agent))) return result;
      route = "primary";
    } else {
      // Not every server has every file (a 404 or empty body even for a valid
      // session), so ask through a different connection.
      route = "throwaway";
    }
  }
}

// Without a session, each retry gets its own short-lived connection.
async function sessionlessFile(game: CanonicalGameId, region: Region, url: string, jar: CookieJar, referer: string, signal?: AbortSignal): Promise<SiteResult> {
  for (let attempt = 1; ; attempt++) {
    const agent = attempt > 1 ? pinnedAgent(game, region) : undefined;
    try {
      const result = await fetchSite(game, region, url, jar, referer, { signal }, agent);
      if (!isRejected(game, region, result, "file")) return result;
      if (describeSegaError(result.body.toString()).code === LOCKED_ERROR_CODE) throw lockedOut(game, url);
      if (attempt >= MAX_ATTEMPTS) return result;
      logger.warn({ url, status: result.status, size: result.body.length }, `${netName(game)} rejected a file request, retrying on a new connection`);
    } catch (error) {
      if (isThrottlingError(error) || signal?.aborted || attempt >= MAX_ATTEMPTS) throw error;
      logger.warn({ err: error, url }, `${netName(game)} file request failed, retrying on a new connection`);
    } finally {
      if (agent) void agent.close();
    }
  }
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

function siteBytes(result: SiteResult, url: URL): SiteBytes {
  if (result.status < 200 || result.status >= 300 || result.body.length === 0) {
    throw new Error(`${url.host}${url.pathname} returned HTTP ${result.status} with ${result.body.length} bytes`);
  }
  return { buffer: result.body, contentType: result.contentType ?? "image/png" };
}

/**
 * Downloads files that need no game session, such as a provider's public assets or catalog covers.
 * A file on a game site still draws from that site's request budget.
 */
export function openPublicAssets(signal?: AbortSignal): Pick<GameSiteClient, "bytes"> {
  return {
    async bytes(url) {
      const target = new URL(url);
      const site = budgetedSite(target.href);
      if (site) {
        const result = await sessionlessFile(site.game, site.region, target.href, { cookies: "" }, siteRoot(site.game, site.region).href, signal);
        if (!result.offsite) return siteBytes(result, target);
        return openPublicAssets(signal).bytes(result.offsite.href);
      }
      const response = await fetch(target, { signal: segaRequestSignal(signal) });
      const body = Buffer.from(await response.arrayBuffer());
      return siteBytes({ status: response.status, url: target.href, body, contentType: response.headers.get("content-type") }, target);
    },
  };
}

/**
 * A game site session that follows same-origin redirects and keeps the cookies each response sets. A
 * session bound to its connections retries the requests the site turns away (see redeemGameSession).
 */
export function openGameSite(game: CanonicalGameId, region: Region, session: GameSiteSession, { signal, assertPage, pageUrl: startUrl }: GameSiteOptions = {}): GameSiteClient {
  const root = siteRoot(game, region);
  const publicAssets = openPublicAssets(signal);
  let pageUrl = startUrl ?? root.href;

  function request(url: string, init: RequestInit, kind: RequestKind): Promise<SiteResult> {
    const withSignal = { ...init, signal };
    if (session.connections) return sessionRequest(session, session.connections, url, pageUrl, withSignal, kind);
    if (kind === "file") return sessionlessFile(game, region, url, session, pageUrl, signal);
    return fetchSite(game, region, url, session, pageUrl, withSignal);
  }

  async function page(path: string, init: RequestInit): Promise<string> {
    const target = siteUrl(game, region, path);
    const result = await request(target.href, init, "page");
    if (result.offsite) throw new Error(`Unexpected game site origin for ${game}/${region}`);
    const html = result.body.toString();
    if (isErrorPage(game, region, result.url)) {
      const error = describeSegaError(html);
      logger.warn({ url: target.href, status: result.status, size: html.length }, `${netName(game)} did not serve the page${formatSegaError(error)}`);
      if (error.code === LOCKED_ERROR_CODE) throw lockedOut(game, target.href);
      assertPage?.(html, result.url);
      throw new Error(`${netName(game)} did not serve ${target.pathname}${formatSegaError(error) || " (redirected to its error page)"}`);
    }
    if (result.status !== 200) {
      throw new Error(`${getGame(game).brand.displayName} page ${new URL(result.url).pathname} returned HTTP ${result.status}`);
    }
    if (html.length === 0) throw new Error(`${netName(game)} returned an empty page for ${target.pathname}`);
    pageUrl = result.url;
    assertPage?.(html, result.url);
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
      const result = await request(target.href, {}, "file");
      return result.offsite ? publicAssets.bytes(result.offsite.href) : siteBytes(result, target);
    },
  };
}
