import "server-only";
import type { Region } from "@/lib/types";
import { getLogger } from "@/lib/request-logger";
import { deleteToken, saveToken } from "../tokens";
import { openSegaSession, type SegaLoginConfig } from "../sega/login";
import type { DivingFishIdentifier } from "./scores/divingfish/client";

export const maimaiSegaLogin = {
  intl: { game: "maimai", region: "intl", kind: "aime-gateway" },
  jp: {
    game: "maimai",
    region: "jp",
    kind: "sega-id-site",
    entryPath: "",
    formToken: "cookie:_t",
    cardSelection: { method: "GET", path: "aimeList/submit/?idx=0" },
  },
} satisfies Record<Exclude<Region, "cn">, SegaLoginConfig>;

export type MaimaiLogin =
  | { kind: "site-session"; cookies: string }
  | { kind: "lxns"; accessToken: string }
  | { kind: "divingfish"; account: DivingFishIdentifier };

/** Signs in with the region's login: SEGA for International and JP, the CN providers for China. */
export async function openMaimaiLogin(userId: string | null, region: Region, token: string, signal?: AbortSignal): Promise<MaimaiLogin> {
  if (region === "cn") return openCnLogin(userId, token.trim(), signal);
  const session = await openSegaSession(maimaiSegaLogin[region], userId, token, signal);
  return { kind: "site-session", cookies: session.cookies };
}

/** A maimai DX NET session, for work that scrapes the site. */
export async function loginAndGetCookies(region: Region, token: string): Promise<string> {
  const login = await openMaimaiLogin(null, region, token);
  if (login.kind !== "site-session") throw new Error(`A ${login.kind} token cannot open a maimai DX NET session.`);
  return login.cookies;
}

async function rejectCnToken(userId: string | null, error: string): Promise<never> {
  getLogger().info("Deleting a maimai CN token that cannot be used");
  if (userId) await deleteToken("maimai", userId, "cn");
  throw new Error(error);
}

async function openCnLogin(userId: string | null, token: string, signal?: AbortSignal): Promise<MaimaiLogin> {
  if (token.startsWith("cn-cookies://")) {
    const cookies = token.slice("cn-cookies://".length);
    if (!cookies) return rejectCnToken(userId, "Invalid cn-cookies token format.");
    return { kind: "site-session", cookies };
  }

  if (token.startsWith("lxns://")) {
    const parsed = parseLxnsToken(token);
    if (!parsed) return rejectCnToken(userId, "Invalid lxns token format. Expected lxns://<access>:://<refresh>:://<expiresAtMs>:://<scope>");
    if (Date.now() < parsed.expiresAtMs - 30_000) {
      getLogger().debug({ userId, ttlSec: Math.round((parsed.expiresAtMs - Date.now()) / 1000) }, "lxns oauth: reusing cached access token");
      return { kind: "lxns", accessToken: parsed.accessToken };
    }
    getLogger().debug({ userId }, "lxns oauth: access token expired or near expiry, refreshing");
    const refreshed = await requestLxnsToken("refresh", { grant_type: "refresh_token", refresh_token: parsed.refreshToken }, parsed.refreshToken, signal);
    if (!refreshed.ok) return rejectCnToken(userId, refreshed.error);
    if (userId) {
      await saveToken("maimai", userId, "cn", formatLxnsToken(refreshed.token));
      getLogger().info({ userId }, "lxns oauth: refreshed token saved");
    }
    return { kind: "lxns", accessToken: refreshed.token.accessToken };
  }

  if (token.startsWith("divingfish://")) {
    const account = parseDivingFishToken(token);
    if (!account) return rejectCnToken(userId, "Invalid divingfish token format. Expected divingfish://<username|qq>:://<value>");
    if (!process.env.DIVINGFISH_DEV_TOKEN) throw new Error("diving-fish is not configured on the server.");
    return { kind: "divingfish", account };
  }

  return rejectCnToken(userId, "Invalid token format. Token must start with 'lxns://', 'divingfish://', or 'cn-cookies://'");
}

function parseDivingFishToken(token: string): DivingFishIdentifier | null {
  const parts = token.slice("divingfish://".length).split(":://");
  if (parts.length !== 2) return null;
  const [kind, value] = parts;
  if ((kind !== "username" && kind !== "qq") || !value) return null;
  return { kind, value };
}

export function formatDivingFishToken(account: DivingFishIdentifier): string {
  return `divingfish://${account.kind}:://${account.value}`;
}

interface LxnsToken {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  scope: string;
}

function parseLxnsToken(token: string): LxnsToken | null {
  const parts = token.slice("lxns://".length).split(":://");
  if (parts.length !== 4) return null;
  const [accessToken, refreshToken, expiresAtRaw, scope] = parts;
  const expiresAtMs = Number(expiresAtRaw);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresAtMs)) return null;
  return { accessToken, refreshToken, expiresAtMs, scope };
}

function formatLxnsToken(token: LxnsToken): string {
  return `lxns://${token.accessToken}:://${token.refreshToken}:://${token.expiresAtMs}:://${token.scope}`;
}

const LXNS_TOKEN_URL = "https://maimai.lxns.net/api/v0/oauth/token";

type LxnsTokenResult = { ok: true; token: LxnsToken } | { ok: false; error: string };

async function requestLxnsToken(grant: "refresh" | "code exchange", params: Record<string, string>, previousRefreshToken?: string, signal?: AbortSignal): Promise<LxnsTokenResult> {
  const clientId = process.env.LXNS_CLIENT_ID;
  const clientSecret = process.env.LXNS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { ok: false, error: "lxns OAuth is not configured on the server." };

  try {
    const resp = await fetch(LXNS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret }).toString(),
      signal,
    });
    if (!resp.ok) {
      const errorText = await resp.text().catch(() => "");
      getLogger().warn({ status: resp.status }, `lxns ${grant} failed: ${errorText}`);
      return { ok: false, error: `lxns ${grant} failed (${resp.status}). Please re-authorize.` };
    }
    const json = await resp.json() as Record<string, unknown>;
    const data = (json.data ?? json) as Record<string, unknown>;
    const accessToken = typeof data.access_token === "string" ? data.access_token : "";
    const refreshToken = typeof data.refresh_token === "string" ? data.refresh_token : previousRefreshToken ?? "";
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 900;
    const scope = typeof data.scope === "string" ? data.scope : "";
    if (!accessToken || !refreshToken) return { ok: false, error: `lxns ${grant} response missing tokens.` };
    getLogger().debug({ ttlSec: expiresIn, scope }, `lxns oauth: ${grant} succeeded`);
    return { ok: true, token: { accessToken, refreshToken, expiresAtMs: Date.now() + expiresIn * 1000, scope } };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    getLogger().error({ err: error }, `lxns ${grant} threw`);
    return { ok: false, error: `Network error during lxns ${grant}.` };
  }
}

/** Exchanges an lxns OAuth code for a stored `lxns://` token. */
export async function exchangeLxnsCode(code: string, redirectUri: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const result = await requestLxnsToken("code exchange", { grant_type: "authorization_code", code, redirect_uri: redirectUri });
  return result.ok ? { ok: true, token: formatLxnsToken(result.token) } : result;
}

export function formatCnCookiesToken(cookies: string): string {
  return `cn-cookies://${cookies}`;
}
