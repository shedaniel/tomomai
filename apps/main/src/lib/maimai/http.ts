import type { Agent } from "undici";
import { agentFetch, createPinnedAgent } from "../http-agent";
import { logger } from "../logger";
import { Region } from "../types";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

// maimai DX NET's backends don't all share session state (or images), and the
// backend is picked per TCP connection. A session stays on the connection it
// was redeemed on, and moves to a fresh one when a backend rejects a request.
export const MAX_SESSION_ATTEMPTS = 4;
const SESSION_IDLE_MS = 5 * 60_000;

interface PinnedSession {
  agent: Agent;
  timer: NodeJS.Timeout;
}

const sessions = new Map<string, PinnedSession>();

export function bindSessionAgent(cookies: string, agent: Agent): void {
  releaseSession(cookies);
  const session: PinnedSession = {
    agent,
    timer: setTimeout(() => releaseSession(cookies), SESSION_IDLE_MS),
  };
  session.timer.unref();
  sessions.set(cookies, session);
}

// Closes the session's connection once its in-flight requests finish. Later
// requests with the same cookies fall back to the shared agent.
export function releaseSession(cookies: string): void {
  const session = sessions.get(cookies);
  if (!session) return;
  sessions.delete(cookies);
  clearTimeout(session.timer);
  void session.agent.close();
}

function getSession(cookies: string): PinnedSession | undefined {
  const session = sessions.get(cookies);
  session?.timer.refresh();
  return session;
}

function rotateSessionAgent(session: PinnedSession, failed: Agent): void {
  if (session.agent !== failed) return;
  session.agent = createPinnedAgent();
  void failed.close();
}

function isRejectedByBackend(response: Response): boolean {
  return response.status === 404 || (!!response.url && new URL(response.url).pathname.startsWith("/maimai-mobile/error"));
}

// Without a session, each retry gets its own short-lived connection.
async function fetchWithBackendRetry(url: string, init: RequestInit, session: PinnedSession | undefined): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const isLastAttempt = attempt >= MAX_SESSION_ATTEMPTS;
    const agent = session ? session.agent : attempt > 1 ? createPinnedAgent() : undefined;

    let response: Response;
    try {
      response = await agentFetch(url, init, agent);
    } catch (error) {
      if (isLastAttempt) throw error;
      logger.warn({ err: error, url }, "maimai request failed, retrying on a new connection");
      if (session && agent) rotateSessionAgent(session, agent);
      continue;
    } finally {
      // Graceful: waits for the caller to finish reading the body.
      if (!session && agent) void agent.close();
    }

    if (isLastAttempt || !isRejectedByBackend(response)) return response;

    logger.warn({ url, status: response.status }, "maimai backend rejected request, retrying on a new connection");
    await response.arrayBuffer().catch(() => undefined);
    if (session && agent) rotateSessionAgent(session, agent);
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
