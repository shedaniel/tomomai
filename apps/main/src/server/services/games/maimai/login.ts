import "server-only";
import { formatLxns, type LxnsToken } from "@/lib/games/token-format";
import type { Region } from "@/lib/games/ids";
import { getLogger } from "@/lib/request-logger";
import { openSegaSession } from "../sega/login";
import { acceptSegaToken, refuseToken } from "../token-policy";
import { saveToken } from "../tokens";

/** A maimai DX NET session for the catalog, which signs in without a player. */
export async function loginAndGetCookies(region: Region, token: string): Promise<string> {
  const accepted = await acceptSegaToken("maimai", null, region, token);
  return (await openSegaSession("maimai", region, null, accepted)).cookies;
}

/** The token's lxns access token, refreshed and saved when it is about to expire. */
export async function lxnsAccessToken(userId: string, region: Region, token: LxnsToken, signal?: AbortSignal): Promise<string> {
  if (Date.now() < token.expiresAtMs - 30_000) {
    getLogger().debug({ userId, ttlSec: Math.round((token.expiresAtMs - Date.now()) / 1000) }, "lxns oauth: reusing cached access token");
    return token.accessToken;
  }
  getLogger().debug({ userId }, "lxns oauth: access token expired or near expiry, refreshing");
  const refreshed = await requestLxnsToken("refresh", { grant_type: "refresh_token", refresh_token: token.refreshToken }, token.refreshToken, signal);
  if (!refreshed.ok) return refuseToken("maimai", userId, region, refreshed.error);
  await saveToken("maimai", userId, region, formatLxns(refreshed.token));
  getLogger().info({ userId }, "lxns oauth: refreshed token saved");
  return refreshed.token.accessToken;
}

const LXNS_TOKEN_URL = "https://maimai.lxns.net/api/v0/oauth/token";

type LxnsTokenResult = { ok: true; token: Omit<LxnsToken, "provider"> } | { ok: false; error: string };

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
  return result.ok ? { ok: true, token: formatLxns(result.token) } : result;
}
