import type { Agent } from "undici";
import { agentFetch, createPinnedAgent } from "../http-agent";
import { getLogger } from "../request-logger";
import { Region } from "../types";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

// maimai DX NET binds a session to the network of the connection that redeemed
// the login redirect, and each redemption replaces the previous session. A
// session keeps that connection as its primary, spreads requests over a few
// helper connections until maimai rejects one, and redeems again on a fresh
// connection if the session itself is rejected. Files missing on the
// primary's server are retried through throwaway connections.
const MAX_ATTEMPTS = 6;
const MAX_REDEEMS = 3;
const HELPER_CONNECTIONS = 3;
const SESSION_IDLE_MS = 5 * 60_000;

interface MaimaiSession {
  region: Region;
  redirectUrl: string;
  redirectCookies: string | null;
  cookies: string;
  primary: Agent;
  // undefined: not opened yet; null: retired after maimai rejected a request on it.
  helpers: (Agent | null | undefined)[];
  next: number;
  redeems: number;
  redeeming: Promise<void> | null;
  released: boolean;
  timer: NodeJS.Timeout;
}

// Keyed by the cookies the session was opened with, which callers keep passing.
const sessions = new Map<string, MaimaiSession>();

async function redeem(region: Region, redirectUrl: string, redirectCookies: string | null): Promise<{ agent: Agent; cookies: string }> {
  for (let attempt = 1; ; attempt++) {
    const agent = createPinnedAgent();
    let response: Response;
    try {
      response = await agentFetch(redirectUrl, {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          ...(redirectCookies ? { "Cookie": redirectCookies } : {}),
        },
        redirect: "manual",
      }, agent);
      await response.arrayBuffer();
    } catch (error) {
      void agent.close();
      throw error;
    }

    const setCookies = response.headers.getSetCookie();
    getLogger().info({ region, status: response.status, count: setCookies.length }, "Redeemed maimai login redirect");
    if (setCookies.length > 0) {
      return { agent, cookies: setCookies.map((header) => header.split(";")[0]).join("; ") };
    }

    void agent.close();
    // A redemption that set no cookies created no session, so it is safe to retry.
    if (attempt >= MAX_ATTEMPTS) {
      throw new Error(`No cookies received from login redirect (status ${response.status})`);
    }
  }
}

// Redeems the login redirect and returns the session cookies. Requests made
// with these cookies through maimaiRequest/maimaiImageRequest use the session
// until releaseSession is called (or it sits idle).
export async function openMaimaiSession(region: Region, redirectUrl: string, redirectCookies: string | null): Promise<string> {
  const { agent, cookies } = await redeem(region, redirectUrl, redirectCookies);
  releaseSession(cookies);
  const session: MaimaiSession = {
    region,
    redirectUrl,
    redirectCookies,
    cookies,
    primary: agent,
    helpers: [],
    next: 0,
    redeems: 1,
    redeeming: null,
    released: false,
    timer: setTimeout(() => releaseSession(cookies), SESSION_IDLE_MS),
  };
  session.timer.unref();
  sessions.set(cookies, session);
  return cookies;
}

// Closes the session's connections once their in-flight requests finish, and
// makes any request still running for it fail instead of retrying.
export function releaseSession(cookies: string): void {
  const session = sessions.get(cookies);
  if (!session) return;
  sessions.delete(cookies);
  session.released = true;
  clearTimeout(session.timer);
  void session.primary.close();
  for (const helper of session.helpers) if (helper) void helper.close();
}

function getSession(cookies: string): MaimaiSession | undefined {
  const session = sessions.get(cookies);
  session?.timer.refresh();
  return session;
}

function nextAgent(session: MaimaiSession): Agent {
  const slot = session.next++ % (HELPER_CONNECTIONS + 1);
  if (slot === 0) return session.primary;
  const helper = session.helpers[slot - 1];
  if (helper === null) return session.primary;
  return (session.helpers[slot - 1] ??= createPinnedAgent());
}

function retireHelper(session: MaimaiSession, helper: Agent): void {
  const slot = session.helpers.indexOf(helper);
  if (slot === -1) return;
  session.helpers[slot] = null;
  void helper.close();
}

async function recoverPrimary(session: MaimaiSession, failed: Agent): Promise<boolean> {
  if (session.primary !== failed) return true;
  if (!session.redeeming) {
    if (session.redeems >= MAX_REDEEMS) return false;
    session.redeems++;
    getLogger().warn({ region: session.region, count: session.redeems }, "maimai rejected the session, redeeming the login redirect again");
    session.redeeming = redeem(session.region, session.redirectUrl, session.redirectCookies)
      .then(({ agent, cookies }) => {
        if (session.released) {
          void agent.close();
          return;
        }
        const old = session.primary;
        session.primary = agent;
        session.cookies = cookies;
        void old.close();
      })
      .finally(() => {
        session.redeeming = null;
      });
  }
  await session.redeeming;
  return true;
}

// Buffers the body so rejections can be detected (including empty 200s) and
// the connection is free for the next request.
async function buffered(response: Response): Promise<{ response: Response; size: number }> {
  const body = await response.arrayBuffer();
  const copy = new Response([101, 204, 205, 304].includes(response.status) ? null : body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  Object.defineProperty(copy, "url", { value: response.url });
  Object.defineProperty(copy, "redirected", { value: response.redirected });
  return { response: copy, size: body.byteLength };
}

function redirectedAway(response: Response, url: string): boolean {
  return response.redirected && new URL(response.url).pathname !== new URL(url).pathname;
}

function isRejected(response: Response, url: string, size: number): boolean {
  return response.status === 404 || redirectedAway(response, url) || (response.status === 200 && size === 0);
}

async function sessionFetch(session: MaimaiSession, url: string, init: RequestInit): Promise<Response> {
  let route: "pool" | "primary" | "throwaway" = "pool";
  for (let attempt = 1; ; attempt++) {
    if (session.redeeming) await session.redeeming;
    if (session.released) throw new Error("maimai session was released");

    const agent = route === "pool" ? nextAgent(session) : route === "primary" ? session.primary : createPinnedAgent();
    const kind = agent === session.primary ? "primary" : route === "throwaway" ? "throwaway" : "helper";
    const headers = { ...(init.headers as Record<string, string>), "Cookie": session.cookies };
    const isLastAttempt = attempt >= MAX_ATTEMPTS;

    let result: { response: Response; size: number };
    try {
      result = await buffered(await agentFetch(url, { ...init, headers }, agent));
    } catch (error) {
      if (session.released || isLastAttempt) throw error;
      getLogger().warn({ err: error, url }, `maimai request failed on the ${kind} connection, retrying`);
      if (kind === "helper") retireHelper(session, agent);
      route = "primary";
      continue;
    } finally {
      if (kind === "throwaway") void agent.close();
    }

    const { response, size } = result;
    if (!isRejected(response, url, size)) return response;
    if (isLastAttempt) return response;

    getLogger().warn({ url, status: response.status, size }, `maimai rejected request on the ${kind} connection, retrying`);
    if (kind === "helper") {
      retireHelper(session, agent);
      route = "primary";
    } else if (kind === "primary" && redirectedAway(response, url)) {
      if (!(await recoverPrimary(session, agent))) return response;
      route = "primary";
    } else {
      // Not every server has every file (a 404 or empty body even for a valid
      // session), so ask through a different connection.
      route = "throwaway";
    }
  }
}

// Without a session, each retry gets its own short-lived connection.
async function sessionlessImageFetch(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const agent = attempt > 1 ? createPinnedAgent() : undefined;
    try {
      const { response, size } = await buffered(await agentFetch(url, init, agent));
      if (attempt >= MAX_ATTEMPTS || !isRejected(response, url, size)) return response;
      getLogger().warn({ url, status: response.status, size }, "maimai rejected image request, retrying on a new connection");
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error;
      getLogger().warn({ err: error, url }, "maimai image request failed, retrying on a new connection");
    } finally {
      if (agent) void agent.close();
    }
  }
}

export function maimaiBaseUrl(region: Region): string {
  if (region === "jp") return "https://maimaidx.jp";
  if (region === "cn") return "https://maimai.wahlap.com";
  return "https://maimaidx-eng.com";
}

// Authenticated GET against the maimai mobile site, mimicking the headers
// the real client sends. Does NOT check status — callers that want custom
// error-handling (e.g. logging the response body) use this directly.
export async function maimaiRequest(url: string, cookies: string, referer: string): Promise<Response> {
  const init: RequestInit = {
    method: "GET",
    headers: {
      "Cookie": cookies,
      "User-Agent": USER_AGENT,
      "Referer": referer,
    },
  };

  const session = getSession(cookies);
  if (!session) return agentFetch(url, init);
  return sessionFetch(session, url, init);
}

export async function maimaiImageRequest(url: string, cookies: string): Promise<Response> {
  const init: RequestInit = {
    method: "GET",
    headers: {
      "Cookie": cookies,
      "User-Agent": USER_AGENT,
    },
  };

  const session = getSession(cookies);
  return session ? sessionFetch(session, url, init) : sessionlessImageFetch(url, init);
}

// Same as maimaiRequest but throws unless maimai served the requested page, so
// an error page is never parsed as (empty) data.
export async function maimaiGet(url: string, cookies: string, referer: string): Promise<Response> {
  const response = await maimaiRequest(url, cookies, referer);
  const body = await response.clone().text();
  if (response.status === 200 && !redirectedAway(response, url) && body.length > 0) return response;

  const errorCode = body.match(/ERROR CODE[：:]\s*(\d+)/)?.[1];
  const finalPath = response.url ? new URL(response.url).pathname : "";
  getLogger().warn({ url, status: response.status, size: body.length }, `maimai did not serve the page: ${finalPath}${errorCode ? ` ERROR CODE ${errorCode}` : ""}`);
  if (errorCode === "100001") {
    throw new Error("Session expired or invalid. Please provide a new token.");
  }
  throw new Error(`maimai did not serve ${url} (HTTP ${response.status}${finalPath ? `, ended at ${finalPath}` : ""}${errorCode ? `, ERROR CODE ${errorCode}` : ""})`);
}

// Same as maimaiGet but returns the response text directly.
export async function maimaiGetHtml(url: string, cookies: string, referer: string): Promise<string> {
  const response = await maimaiGet(url, cookies, referer);
  return response.text();
}
