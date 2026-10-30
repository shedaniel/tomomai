import type { Agent } from "undici";
import { agentFetch, createPinnedAgent } from "../http-agent";
import { logger } from "../logger";
import { Region } from "../types";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

// maimai DX NET's backends don't all share session state (or images), and the
// backend is picked per TCP connection. A session keeps a few pinned
// connections, starting with the one it was redeemed on, replaces any
// connection whose backend rejects a request, and retries on a connection that
// has already worked.
export const MAX_SESSION_ATTEMPTS = 4;
const SESSION_CONNECTIONS = 4;
const SESSION_IDLE_MS = 5 * 60_000;

interface PinnedSession {
  agents: Agent[];
  verified: WeakSet<Agent>;
  next: number;
  timer: NodeJS.Timeout;
}

const sessions = new Map<string, PinnedSession>();

export function bindSessionAgent(cookies: string, agent: Agent): void {
  releaseSession(cookies);
  const session: PinnedSession = {
    agents: [agent],
    verified: new WeakSet([agent]),
    next: 0,
    timer: setTimeout(() => releaseSession(cookies), SESSION_IDLE_MS),
  };
  session.timer.unref();
  sessions.set(cookies, session);
}

// Closes the session's connections once their in-flight requests finish.
// Later requests with the same cookies fall back to the shared agent.
export function releaseSession(cookies: string): void {
  const session = sessions.get(cookies);
  if (!session) return;
  sessions.delete(cookies);
  clearTimeout(session.timer);
  for (const agent of session.agents) void agent.close();
}

function getSession(cookies: string): PinnedSession | undefined {
  const session = sessions.get(cookies);
  session?.timer.refresh();
  return session;
}

function nextSessionAgent(session: PinnedSession, isRetry: boolean): Agent {
  if (isRetry) {
    const verified = session.agents.find((agent) => session.verified.has(agent));
    if (verified) return verified;
  }
  const slot = session.next++ % SESSION_CONNECTIONS;
  return (session.agents[slot] ??= createPinnedAgent());
}

function rotateSessionAgent(session: PinnedSession, failed: Agent): void {
  const slot = session.agents.indexOf(failed);
  if (slot === -1) return;
  session.agents[slot] = createPinnedAgent();
  void failed.close();
}

function isRejectedByBackend(response: Response): boolean {
  return response.status === 404 || (!!response.url && new URL(response.url).pathname.startsWith("/maimai-mobile/error"));
}

// Without a session, each retry gets its own short-lived connection.
async function fetchWithBackendRetry(url: string, init: RequestInit, session: PinnedSession | undefined): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const isLastAttempt = attempt >= MAX_SESSION_ATTEMPTS;
    const agent = session ? nextSessionAgent(session, attempt > 1) : attempt > 1 ? createPinnedAgent() : undefined;

    let response: Response;
    try {
      response = await agentFetch(url, init, agent);
    } catch (error) {
      if (isLastAttempt) throw error;
      logger.warn({ err: error, url }, "maimai request failed, retrying on another connection");
      if (session && agent) rotateSessionAgent(session, agent);
      continue;
    } finally {
      // Graceful: waits for the caller to finish reading the body.
      if (!session && agent) void agent.close();
    }

    if (!isRejectedByBackend(response)) {
      if (session && agent) session.verified.add(agent);
      return response;
    }
    if (isLastAttempt) return response;

    logger.warn({ url, status: response.status }, "maimai backend rejected request, retrying on another connection");
    await response.arrayBuffer().catch(() => undefined);
    // A connection that has worked might have hit a genuine 404, so it only
    // loses its standing; it is replaced if it gets rejected again.
    if (session && agent && !session.verified.delete(agent)) rotateSessionAgent(session, agent);
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
  return fetchWithBackendRetry(url, init, session);
}

// Images don't need a session, but some backends 404 on them, so they are
// retried even without one.
export async function maimaiImageRequest(url: string, cookies: string): Promise<Response> {
  return fetchWithBackendRetry(url, {
    method: "GET",
    headers: {
      "Cookie": cookies,
      "User-Agent": USER_AGENT,
    },
  }, getSession(cookies));
}

// Same as maimaiRequest but throws if status !== 200.
export async function maimaiGet(url: string, cookies: string, referer: string): Promise<Response> {
  const response = await maimaiRequest(url, cookies, referer);
  if (response.status !== 200) {
    await response.arrayBuffer().catch(() => undefined);
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response;
}

// Same as maimaiGet but returns the response text directly.
export async function maimaiGetHtml(url: string, cookies: string, referer: string): Promise<string> {
  const response = await maimaiGet(url, cookies, referer);
  return response.text();
}
