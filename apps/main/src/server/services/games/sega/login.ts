import "server-only";
import { load } from "cheerio";
import type { Logger } from "pino";
import { getGame } from "@/lib/games/registry";
import { SEGA_AIME_GATEWAY, siteUrl } from "@/lib/games/sites";
import { formatSegaAccount, type SegaAccountToken, type SegaToken } from "@/lib/games/token-format";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Region } from "@/lib/types";
import { getLogger } from "@/lib/request-logger";
import { refuseToken } from "../token-policy";
import { updateToken } from "../tokens";
import { cookieValue, mergeCookies, openGameSite, requestGameSite, responseCookies, segaRequestSignal, SEGA_USER_AGENT, type GameSiteSession } from "./http";

/** How a game site signs in a SEGA ID. Site paths resolve against the mobile root. */
export type SegaLoginConfig = { game: CanonicalGameId; region: Region } & (
  | { kind: "aime-gateway" }
  | {
    kind: "sega-id-site";
    entryPath: string;
    /** Where the sign-in form keeps its CSRF token. */
    formToken: "cookie:_t" | "input:token";
    /** GET opens a fixed card path. POST submits the card list's own form. */
    cardSelection: { method: "GET"; path: string } | { method: "POST" };
  }
);

type GatewayConfig = Extract<SegaLoginConfig, { kind: "aime-gateway" }>;
type IdSiteConfig = Extract<SegaLoginConfig, { kind: "sega-id-site" }>;

type LoginOutcome =
  | { kind: "ok"; session: GameSiteSession; refreshedToken?: string }
  | { kind: "rejected"; error: string }
  | { kind: "transient"; error: string; stepType: string; err?: unknown };

const REJECTED_CREDENTIALS = "Login failed. Please check your username and password.";

/**
 * Signs in with a SEGA token and returns a ready session on the game site.
 * A token SEGA refuses is deleted, and one that failed for a transient reason is kept.
 */
export async function openSegaSession(config: SegaLoginConfig, userId: string | null, token: SegaToken, signal?: AbortSignal): Promise<GameSiteSession> {
  const log = getLogger().child({ game: config.game, region: config.region, userId });
  const outcome = await signIn(config, token, log, signal);
  switch (outcome.kind) {
    case "ok":
      if (outcome.refreshedToken && userId) await updateToken(config.game, userId, config.region, outcome.refreshedToken);
      return outcome.session;
    case "rejected":
      return refuseToken(config.game, userId, config.region, outcome.error);
    case "transient":
      log.warn({ err: outcome.err, stepType: outcome.stepType }, "SEGA login failed");
      throw new Error(outcome.error);
  }
}

function signIn(config: SegaLoginConfig, token: SegaToken, log: Logger, signal?: AbortSignal): Promise<LoginOutcome> | LoginOutcome {
  if (config.kind === "aime-gateway") return aimeGatewayLogin(config, token, log, signal);
  if (token.provider === "sega-cookie") return { kind: "rejected", error: "Invalid token format. Cookie tokens are not supported in this region." };
  return segaIdSiteLogin(config, token, log, signal);
}

function transientFailure(err: unknown, stepType: string, signal?: AbortSignal): LoginOutcome {
  if (signal?.aborted) throw signal.reason;
  const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "failed";
  return { kind: "transient", error: `SEGA service request ${reason} during ${stepType}. Please try again later.`, stepType, err };
}

function gatewayRequest(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("User-Agent", SEGA_USER_AGENT);
  return fetch(url, { ...init, headers, signal: segaRequestSignal(signal), redirect: "manual" });
}

/** The game site callback the gateway redirected to, or why there is none. It must stay on this game's site. */
function gatewayCallback(config: GatewayConfig, response: Response): URL | string {
  if (response.status !== 302) return `Unexpected response from SEGA servers (${response.status})`;
  const location = response.headers.get("Location");
  if (!location) return "No redirect URL received from token validation";
  return siteUrl(config.game, config.region, location);
}

/** The callback for a gateway session cookie, null when the session has expired, or why the gateway gave neither. */
async function resumeGatewaySession(config: GatewayConfig, clal: string, signal?: AbortSignal): Promise<URL | string | null> {
  const response = await gatewayRequest(SEGA_AIME_GATEWAY.loginUrl(config.game, config.region), { headers: { Cookie: `clal=${clal}` } }, signal);
  await response.body?.cancel();
  // An expired session gets the login form again.
  return response.status === 200 ? null : gatewayCallback(config, response);
}

async function aimeGatewayLogin(config: GatewayConfig, credentials: SegaToken, log: Logger, signal?: AbortSignal): Promise<LoginOutcome> {
  let stepType = "gateway";
  try {
    let callback: URL;
    let refreshedToken: string | undefined;
    if (credentials.provider === "sega-cookie") {
      const resumed = await resumeGatewaySession(config, credentials.clal, signal);
      if (resumed === null) return { kind: "rejected", error: "Token has expired. Please provide a new token." };
      if (typeof resumed === "string") return { kind: "transient", error: resumed, stepType };
      callback = resumed;
    } else {
      // Any failure of the saved session falls back to signing in with the credentials.
      const resumed = credentials.clal
        ? await resumeGatewaySession(config, credentials.clal, signal).catch(err => {
          if (signal?.aborted) throw err;
          return null;
        })
        : null;
      if (resumed instanceof URL) {
        callback = resumed;
      } else {
        if (credentials.clal) log.info("Refreshing SEGA account session");
        stepType = "entry";
        log.info({ stepType }, "Attempting SEGA account login");
        const entry = await gatewayRequest(SEGA_AIME_GATEWAY.loginUrl(config.game, config.region), {}, signal);
        const cookies = responseCookies(entry.headers);
        const retention = load(await entry.text())("input[name=retention]").attr("value") ?? "1";
        if (!cookies) return { kind: "transient", error: "Failed to obtain session cookies. Please try again later.", stepType };

        stepType = "credentials";
        log.info({ stepType }, "Submitting SEGA account login");
        const response = await gatewayRequest(SEGA_AIME_GATEWAY.submitUrl, {
          method: "POST",
          headers: { Cookie: cookies, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ retention, sid: credentials.username, password: credentials.password }).toString(),
        }, signal);
        await response.body?.cancel();
        // Refused credentials get the login form again.
        if (response.status === 200) return { kind: "rejected", error: REJECTED_CREDENTIALS };
        const submitted = gatewayCallback(config, response);
        if (!(submitted instanceof URL)) return { kind: "transient", error: submitted, stepType };
        const clal = cookieValue(responseCookies(response.headers), "clal");
        if (!clal) {
          return { kind: "transient", error: "SEGA accepted your credentials but did not return a session cookie. Please try again in a few minutes or resubmit your token in Settings > Fetch.", stepType };
        }
        callback = submitted;
        refreshedToken = formatSegaAccount(credentials.username, credentials.password, clal);
      }
    }

    stepType = "exchange";
    const session = { cookies: "" };
    await openGameSite(config.game, config.region, session, { signal }).html(callback.href);
    if (!session.cookies) {
      return { kind: "transient", error: `${getGame(config.game).brand.netName} did not start a session. Please try again later.`, stepType };
    }
    return { kind: "ok", session, refreshedToken };
  } catch (err) {
    return transientFailure(err, stepType, signal);
  }
}

async function readFormToken(config: IdSiteConfig, entry: Response, cookies: string): Promise<string | undefined> {
  if (config.formToken === "input:token") return load(await entry.text())("input[name=token]").attr("value");
  await entry.body?.cancel();
  return cookieValue(cookies, "_t");
}

async function segaIdSiteLogin(config: IdSiteConfig, credentials: SegaAccountToken, log: Logger, signal?: AbortSignal): Promise<LoginOutcome> {
  const { game, region } = config;
  let stepType = "entry";
  log.info({ stepType }, "Attempting SEGA account login");
  try {
    const entryUrl = siteUrl(game, region, config.entryPath).href;
    const entry = await requestGameSite(game, region, entryUrl, { signal });
    const cookies = responseCookies(entry.headers);
    const formToken = await readFormToken(config, entry, cookies);
    if (!cookies) return { kind: "transient", error: "Failed to obtain session cookies. Please try again later.", stepType };
    if (!formToken) return { kind: "transient", error: "SEGA did not return a sign-in form token. Please try again later.", stepType };

    stepType = "credentials";
    log.info({ stepType }, "Submitting SEGA account login");
    const response = await requestGameSite(game, region, "submit/", {
      signal,
      method: "POST",
      headers: { Cookie: cookies, "Content-Type": "application/x-www-form-urlencoded", Referer: entryUrl },
      body: new URLSearchParams({ segaId: credentials.username, password: credentials.password, token: formToken }).toString(),
    });
    await response.body?.cancel();
    if (response.status >= 400) return { kind: "transient", error: `Unexpected response from SEGA servers (${response.status})`, stepType };
    const location = response.headers.get("Location");
    // Refused credentials land on the sign-in or an error page instead of the card list.
    if (response.status !== 302 || !location || siteUrl(game, region, location).pathname !== siteUrl(game, region, "aimeList/").pathname) {
      return { kind: "rejected", error: REJECTED_CREDENTIALS };
    }

    const session = { cookies: mergeCookies(cookies, responseCookies(response.headers)) };
    const site = openGameSite(game, region, session, { signal, pageUrl: entryUrl });
    if (config.cardSelection.method === "GET") {
      stepType = "card-selection";
      log.info({ stepType }, "Selecting SEGA account card");
      await site.html(config.cardSelection.path);
    } else {
      stepType = "card-list";
      log.info({ stepType }, "Reading SEGA account cards");
      const $ = load(await site.html(location));
      const form = $("form").filter((_, element) => $(element).find("input[name=idx]").length > 0).first();
      const fields = new URLSearchParams();
      form.find("input[type=hidden][name]").each((_, element) => fields.set($(element).attr("name")!, $(element).attr("value") ?? ""));
      const action = form.attr("action");
      if (!action || !fields.has("idx") || !fields.get("token")) throw new Error("No selectable SEGA card found");
      stepType = "card-selection";
      log.info({ stepType }, "Selecting SEGA account card");
      await site.post(new URL(action, site.pageUrl).href, fields);
    }
    return { kind: "ok", session };
  } catch (err) {
    return transientFailure(err, stepType, signal);
  }
}
