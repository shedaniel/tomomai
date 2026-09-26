import "server-only";
import type { Region } from "@/lib/types";
import { getLogger } from "@/lib/request-logger";
import { deleteToken, saveToken } from "../tokens";
import { processSegaToken, type TokenValidationResult } from "../sega/login";
import { getCookiesFromRedirect } from "../sega/http";
import { maimaiSegaLogin } from "./login-config";

export async function processMaimaiToken(userId: string | null, region: Region, token: string): Promise<TokenValidationResult> {
  const sanitizedToken = token.trim();
  if (sanitizedToken.startsWith("cookie://") || sanitizedToken.startsWith("account://")) {
    if (region !== "intl" && region !== "jp") {
      return { isValid: false, error: "SEGA ID and cookie tokens are only supported for JP and International regions." };
    }
    return processSegaToken(maimaiSegaLogin[region], userId, sanitizedToken);
  }

  // Handle lxns:// format
  if (sanitizedToken.startsWith('lxns://')) {
    if (region !== "cn") {
      return {
        isValid: false,
        error: "lxns:// token format is only supported for CN region.",
      };
    }

    const parsed = parseLxnsToken(sanitizedToken);
    if (!parsed) {
      getLogger().info("Invalid lxns token format, removing from database");
      if (userId) {
        await deleteToken("maimai", userId, region);
      }
      return {
        isValid: false,
        error: "Invalid lxns token format. Expected lxns://<access>:://<refresh>:://<expiresAtMs>:://<scope>",
      };
    }

    // Reuse access token if not within 30s of expiry
    if (Date.now() < parsed.expiresAtMs - 30_000) {
      const ttlSec = Math.round((parsed.expiresAtMs - Date.now()) / 1000);
      getLogger().debug({ userId, ttlSec }, "lxns oauth: reusing cached access token");
      return {
        isValid: true,
        token: sanitizedToken,
      };
    }

    // Refresh
    getLogger().debug({ userId }, "lxns oauth: access token expired or near expiry, refreshing");
    const refreshed = await refreshLxnsToken(parsed.refreshToken);
    if (!refreshed.isValid || !refreshed.token) {
      getLogger().warn("lxns refresh failed, deleting token");
      if (userId) {
        await deleteToken("maimai", userId, region);
      }
      return refreshed;
    }

    if (userId) {
      await saveToken("maimai", userId, "cn", refreshed.token);
      getLogger().info({ userId }, "lxns oauth: refreshed token saved");
    }
    return refreshed;
  }

  // Handle cn-cookies:// format (maimai-mobile session cookies for CN,
  // captured via the WeChat OAuth → HTTP-proxy flow). Returns the cookies
  // verbatim plus a maimai-mobile referer so the existing scrapeFetcher
  // pipeline can consume them like any other cookie-based session.
  if (sanitizedToken.startsWith('cn-cookies://')) {
    if (region !== "cn") {
      return {
        isValid: false,
        error: "cn-cookies:// token format is only supported for CN region.",
      };
    }
    const parsed = parseCnCookiesToken(sanitizedToken);
    if (!parsed) {
      getLogger().info("Invalid cn-cookies token format, removing from database");
      if (userId) {
        await deleteToken("maimai", userId, region);
      }
      return {
        isValid: false,
        error: "Invalid cn-cookies token format.",
      };
    }
    return {
      isValid: true,
      redirectUrl: "https://maimai.wahlap.com/maimai-mobile/",
      cookies: parsed.cookies,
      cookiesReady: true,
    };
  }

  // Handle divingfish:// format
  if (sanitizedToken.startsWith('divingfish://')) {
    if (region !== "cn") {
      return {
        isValid: false,
        error: "divingfish:// token format is only supported for CN region.",
      };
    }

    const parsed = parseDivingFishToken(sanitizedToken);
    if (!parsed) {
      getLogger().info("Invalid divingfish token format, removing from database");
      if (userId) {
        await deleteToken("maimai", userId, region);
      }
      return {
        isValid: false,
        error: "Invalid divingfish token format. Expected divingfish://<username|qq>:://<value>",
      };
    }

    if (!process.env.DIVINGFISH_DEV_TOKEN) {
      return {
        isValid: false,
        error: "diving-fish is not configured on the server.",
      };
    }

    return {
      isValid: true,
      token: sanitizedToken,
    };
  }

  // Invalid token format
  getLogger().info("Invalid token format, removing from database");
  if (userId) {
    await deleteToken("maimai", userId, region);
  }
  return {
    isValid: false,
    error: "Invalid token format. Token must start with 'cookie://', 'account://', 'lxns://', 'divingfish://', or 'cn-cookies://'",
  };
}

export interface ParsedDivingFishToken {
  kind: "username" | "qq";
  value: string;
}

export function parseDivingFishToken(token: string): ParsedDivingFishToken | null {
  if (!token.startsWith('divingfish://')) return null;
  const body = token.substring('divingfish://'.length);
  const parts = body.split(':://');
  if (parts.length !== 2) return null;
  const [kind, value] = parts;
  if ((kind !== "username" && kind !== "qq") || !value) return null;
  return { kind, value };
}

export function formatDivingFishToken(parts: ParsedDivingFishToken): string {
  return `divingfish://${parts.kind}:://${parts.value}`;
}

interface ParsedLxnsToken {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  scope: string;
}

export function parseLxnsToken(token: string): ParsedLxnsToken | null {
  if (!token.startsWith('lxns://')) return null;
  const body = token.substring('lxns://'.length);
  const parts = body.split(':://');
  if (parts.length !== 4) return null;
  const [accessToken, refreshToken, expiresAtRaw, scope] = parts;
  const expiresAtMs = Number(expiresAtRaw);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresAtMs)) return null;
  return { accessToken, refreshToken, expiresAtMs, scope };
}

export function formatLxnsToken(parts: ParsedLxnsToken): string {
  return `lxns://${parts.accessToken}:://${parts.refreshToken}:://${parts.expiresAtMs}:://${parts.scope}`;
}

const LXNS_TOKEN_URL = "https://maimai.lxns.net/api/v0/oauth/token";

export async function refreshLxnsToken(refreshToken: string): Promise<TokenValidationResult> {
  const clientId = process.env.LXNS_CLIENT_ID;
  const clientSecret = process.env.LXNS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { isValid: false, error: "lxns OAuth is not configured on the server." };
  }

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const resp = await fetch(LXNS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!resp.ok) {
      const errorText = await resp.text().catch(() => "");
      getLogger().warn({ status: resp.status }, `lxns refresh failed: ${errorText}`);
      return { isValid: false, error: `lxns refresh failed (${resp.status}). Please re-authorize.` };
    }
    const json = await resp.json() as Record<string, unknown>;
    const data = (json.data ?? json) as Record<string, unknown>;
    const accessToken = typeof data.access_token === "string" ? data.access_token : "";
    const newRefreshToken = typeof data.refresh_token === "string" ? data.refresh_token : refreshToken;
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 900;
    const scope = typeof data.scope === "string" ? data.scope : "";
    if (!accessToken) {
      return { isValid: false, error: "lxns refresh response missing access_token." };
    }
    const formatted = formatLxnsToken({
      accessToken,
      refreshToken: newRefreshToken,
      expiresAtMs: Date.now() + expiresIn * 1000,
      scope,
    });
    getLogger().debug({ ttlSec: expiresIn, scope }, "lxns oauth: refresh succeeded");
    return { isValid: true, token: formatted };
  } catch (error) {
    getLogger().error({ err: error }, "lxns refresh threw");
    return { isValid: false, error: "Network error during lxns refresh." };
  }
}

export async function exchangeLxnsCode(
  code: string,
  redirectUri: string
): Promise<TokenValidationResult> {
  const clientId = process.env.LXNS_CLIENT_ID;
  const clientSecret = process.env.LXNS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { isValid: false, error: "lxns OAuth is not configured on the server." };
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });
    const resp = await fetch(LXNS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!resp.ok) {
      const errorText = await resp.text().catch(() => "");
      getLogger().warn({ status: resp.status }, `lxns code exchange failed: ${errorText}`);
      return { isValid: false, error: `lxns code exchange failed (${resp.status}).` };
    }
    const json = await resp.json() as Record<string, unknown>;
    const data = (json.data ?? json) as Record<string, unknown>;
    const accessToken = typeof data.access_token === "string" ? data.access_token : "";
    const refreshToken = typeof data.refresh_token === "string" ? data.refresh_token : "";
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 900;
    const scope = typeof data.scope === "string" ? data.scope : "";
    if (!accessToken || !refreshToken) {
      return { isValid: false, error: "lxns code exchange response missing tokens." };
    }
    const formatted = formatLxnsToken({
      accessToken,
      refreshToken,
      expiresAtMs: Date.now() + expiresIn * 1000,
      scope,
    });
    return { isValid: true, token: formatted };
  } catch (error) {
    getLogger().error({ err: error }, "lxns code exchange threw");
    return { isValid: false, error: "Network error during lxns code exchange." };
  }
}

export function formatCnCookiesToken(cookies: string): string {
  return `cn-cookies://${cookies}`;
}

export function parseCnCookiesToken(token: string): { cookies: string } | null {
  if (!token.startsWith("cn-cookies://")) return null;
  const cookies = token.substring("cn-cookies://".length);
  if (!cookies) return null;
  return { cookies };
}

export async function loginAndGetCookies(region: Region, token: string): Promise<string> {
  const validation = await processMaimaiToken(null, region, token);
  if (!validation.isValid) throw new Error(validation.error || "Token validation failed");
  if (validation.cookiesReady && validation.cookies) return validation.cookies;
  if (!validation.redirectUrl) throw new Error("No redirect URL received from token validation");
  return getCookiesFromRedirect("maimai", region, validation.redirectUrl, validation.cookies ?? null);
}
