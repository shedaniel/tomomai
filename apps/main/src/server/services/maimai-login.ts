import { db } from "@/lib/db";
import { userTokens } from "@/lib/db/schema-pg";
import { eq, and } from "drizzle-orm";
import { agentFetch } from "@/lib/http-agent";
import { takeMaimaiRequest } from "@/lib/maimai/budget";
import { MaimaiBusyError, MaimaiLockedError } from "@/lib/maimai/errors";
import { openMaimaiSession } from "@/lib/maimai/http";
import { Region } from "@/lib/types";
import { encryptToken } from "@/lib/token-crypto";
import { logger } from "@/lib/logger";

export interface TokenValidationResult {
  isValid: boolean;
  redirectUrl?: string;
  error?: string;
  cookies?: string;
  token?: string;
  // True when `cookies` are already a fully-authenticated maimai-mobile
  // session and don't need an additional getCookiesFromRedirect exchange.
  cookiesReady?: boolean;
}

export async function processMaimaiToken(
  userId: string | null,
  region: Region,
  token: string
): Promise<TokenValidationResult> {
  const sanitizedToken = token.trim();

  // Handle cookie:// format
  if (sanitizedToken.startsWith('cookie://')) {
    if (region === "jp") {
      return {
        isValid: false,
        error: "Cookie format is not supported for Japan region.",
      };
    }

    let cookieValue = sanitizedToken.substring('cookie://'.length);

    // Strip clal= prefix if present since validateMaimaiToken expects just the cookie value
    if (cookieValue.startsWith('clal=')) {
      cookieValue = cookieValue.substring('clal='.length);
    }

    return await validateInternationalMaimaiToken(userId, cookieValue);
  }

  // Handle account:// format
  if (sanitizedToken.startsWith('account://')) {
    const accountData = sanitizedToken.substring('account://'.length);

    let cookieValue: string | null = null;
    let username: string;
    let password: string;

    // Use :://  as delimiter to avoid conflicts with @ in passwords
    const parts = accountData.split(':://');

    if (parts.length === 2) {
      // Format: account://USERNAME:://PASSWORD
      username = parts[0];
      password = parts[1];
    } else if (parts.length === 3) {
      // Format: account://COOKIE:://USERNAME:://PASSWORD
      cookieValue = parts[0];
      username = parts[1];
      password = parts[2];
    } else {
      logger.info("Invalid account token format, removing from database");
      if (userId) {
        await deleteToken(userId, region);
      }
      return {
        isValid: false,
        error: "Invalid account token format. Expected account://USERNAME:://PASSWORD or account://COOKIE:://USERNAME:://PASSWORD",
      };
    }

    // Validate that we have all required parts
    if (!username || !password) {
      logger.info("Invalid account token format, missing username or password");
      if (userId) {
        await deleteToken(userId, region);
      }
      return {
        isValid: false,
        error: "Invalid account token format. Username and password cannot be empty.",
      };
    }

    // If we have a cookie, try to validate it first
    if (cookieValue && region === "intl") {
      logger.info({ userId, region }, "Trying to validate existing cookie");
      // Validate token without auto-deleting (we'll handle re-login here)
      const cookieResult = await validateInternationalMaimaiToken(
        userId,
        cookieValue,
        false  // Don't delete on failure - we'll try to refresh first
      );

      if (cookieResult.isValid) {
        return cookieResult;
      }

      // Token validation failed - attempt automatic re-login
      logger.info("Token validation failed, attempting automatic re-login");
      const refreshResult = await performInternationalAccountLogin(
        userId,
        username,
        password
      );

      if (refreshResult.isValid && refreshResult.token && userId) {
        logger.info("Token refresh successful, updating database");
        await updateToken(userId, region, refreshResult.token, { username, password });
        return refreshResult;
      }

      // Re-login also failed - delete token and return error
      logger.warn("Token refresh failed, deleting token");
      if (userId) {
        await deleteToken(userId, region);
      }
      return refreshResult;
    }

    // Proceed with login flow
    return await performAccountLogin(userId, region, username, password);
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
      logger.info("Invalid lxns token format, removing from database");
      if (userId) {
        await deleteToken(userId, region);
      }
      return {
        isValid: false,
        error: "Invalid lxns token format. Expected lxns://<access>:://<refresh>:://<expiresAtMs>:://<scope>",
      };
    }

    // Reuse access token if not within 30s of expiry
    if (Date.now() < parsed.expiresAtMs - 30_000) {
      const ttlSec = Math.round((parsed.expiresAtMs - Date.now()) / 1000);
      logger.debug({ userId, ttlSec }, "lxns oauth: reusing cached access token");
      return {
        isValid: true,
        token: sanitizedToken,
      };
    }

    // Refresh
    logger.debug({ userId }, "lxns oauth: access token expired or near expiry, refreshing");
    const refreshed = await refreshLxnsToken(parsed.refreshToken);
    if (!refreshed.isValid || !refreshed.token) {
      logger.warn("lxns refresh failed, deleting token");
      if (userId) {
        await deleteToken(userId, region);
      }
      return refreshed;
    }

    if (userId) {
      await saveLxnsToken(userId, refreshed.token);
      logger.info({ userId }, "lxns oauth: refreshed token saved");
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
      logger.info("Invalid cn-cookies token format, removing from database");
      if (userId) {
        await deleteToken(userId, region);
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
      logger.info("Invalid divingfish token format, removing from database");
      if (userId) {
        await deleteToken(userId, region);
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
  logger.info("Invalid token format, removing from database");
  if (userId) {
    await deleteToken(userId, region);
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

export async function saveDivingFishToken(userId: string, formattedToken: string): Promise<void> {
  const encrypted = encryptToken(formattedToken);
  try {
    await db.insert(userTokens).values({
      userId,
      region: "cn",
      token: encrypted,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch {
    await db
      .update(userTokens)
      .set({ token: encrypted, updatedAt: new Date() })
      .where(and(eq(userTokens.userId, userId), eq(userTokens.region, "cn")));
  }
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

export async function saveLxnsToken(userId: string, formattedToken: string): Promise<void> {
  const encrypted = encryptToken(formattedToken);
  try {
    await db.insert(userTokens).values({
      userId,
      region: "cn",
      token: encrypted,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch {
    await db
      .update(userTokens)
      .set({ token: encrypted, updatedAt: new Date() })
      .where(and(eq(userTokens.userId, userId), eq(userTokens.region, "cn")));
  }
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
      logger.warn({ status: resp.status }, `lxns refresh failed: ${errorText}`);
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
    logger.debug({ ttlSec: expiresIn, scope }, "lxns oauth: refresh succeeded");
    return { isValid: true, token: formatted };
  } catch (error) {
    logger.error({ err: error }, "lxns refresh threw");
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
      logger.warn({ status: resp.status }, `lxns code exchange failed: ${errorText}`);
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
    logger.error({ err: error }, "lxns code exchange threw");
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

export async function saveCnCookiesToken(userId: string, formattedToken: string): Promise<void> {
  const encrypted = encryptToken(formattedToken);
  try {
    await db.insert(userTokens).values({
      userId,
      region: "cn",
      token: encrypted,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch {
    await db
      .update(userTokens)
      .set({ token: encrypted, updatedAt: new Date() })
      .where(and(eq(userTokens.userId, userId), eq(userTokens.region, "cn")));
  }
}

export async function deleteToken(userId: string, region: Region): Promise<void> {
  await db
    .delete(userTokens)
    .where(
      and(
        eq(userTokens.userId, userId),
        eq(userTokens.region, region)
      )
    );
}

async function updateToken(
  userId: string,
  region: Region,
  clalToken: string,
  credentials: { username: string; password: string }
): Promise<void> {
  const newTokenFormat = `account://${clalToken}:://${credentials.username}:://${credentials.password}`;
  const encryptedToken = encryptToken(newTokenFormat);

  await db
    .update(userTokens)
    .set({
      token: encryptedToken,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(userTokens.userId, userId),
        eq(userTokens.region, region)
      )
    );
}

async function performAccountLogin(
  userId: string | null,
  region: Region,
  username: string,
  password: string
): Promise<TokenValidationResult> {
  return region === "intl" ? await performInternationalAccountLogin(userId, username, password) : await performJapanAccountLogin(userId, username, password);
}

async function performJapanAccountLogin(
  userId: string | null,
  username: string,
  password: string
): Promise<TokenValidationResult> {
  const maimaiMobileUrl = "https://maimaidx.jp/maimai-mobile/";
  const submitUrl = "https://maimaidx.jp/maimai-mobile/submit/";

  logger.info({ userId, region: "jp" }, "Attempting account login");

  try {
    // Step 1: Get the maimai mobile page to obtain _t token and cookies
    logger.debug("Step 1: fetching maimai mobile page to get _t token and cookies");
    await takeMaimaiRequest(maimaiMobileUrl);
    const maimaiPageResponse = await agentFetch(maimaiMobileUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      redirect: "manual", // Don't follow redirects
    });

    logger.debug({ status: maimaiPageResponse.status }, "Maimai mobile page fetched");

    // Extract cookies from Set-Cookie headers
    let setCookieHeaders: string[] = [];
    if (maimaiPageResponse.headers.getSetCookie) {
      setCookieHeaders = maimaiPageResponse.headers.getSetCookie();
    } else {
      // Fallback for environments that don't support getSetCookie()
      const cookieHeader = maimaiPageResponse.headers.get('set-cookie');
      if (cookieHeader) {
        setCookieHeaders = [cookieHeader];
      }
    }

    if (setCookieHeaders.length === 0) {
      logger.warn("No Set-Cookie headers in maimai mobile page response");
      if (userId) {
        await deleteToken(userId, "jp");
      }
      return {
        isValid: false,
        error: "Failed to obtain session cookies. Please try again later.",
      };
    }

    // Extract _t token from Set-Cookie headers
    let tToken = "";
    const cookies = setCookieHeaders.map(header => {
      // Extract just the name=value part (before first semicolon)
      const cookiePart = header.split(';')[0];

      // Check if this is the _t token
      if (cookiePart.startsWith('_t=')) {
        tToken = cookiePart.substring(3); // Remove '_t=' prefix
        logger.debug("Extracted _t token");
      }

      return cookiePart;
    }).join('; ');

    if (!tToken) {
      logger.warn("Could not extract _t token from Set-Cookie headers");
      if (userId) {
        await deleteToken(userId, "jp");
      }
      return {
        isValid: false,
        error: "Failed to obtain authentication token. Please try again later.",
      };
    }

    logger.debug({ count: setCookieHeaders.length }, "Parsed cookies for login request");

    // Step 2: POST credentials with all cookies and _t token
    logger.debug("Step 2: posting credentials with cookies and _t token");
    const formData = new URLSearchParams({
      segaId: username,
      password: password,
      token: tToken
    });

    await takeMaimaiRequest(submitUrl);
    const response = await agentFetch(submitUrl, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Cookie": cookies,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": maimaiMobileUrl,
      },
      body: formData.toString(),
      redirect: "manual", // Don't follow redirects
    });

    logger.debug({ status: response.status }, "Japan account login response");

    if (response.status === 302) {
      // Check redirect URL
      const redirectUrl = response.headers.get("Location");
      logger.debug({ url: redirectUrl }, "Login redirect");

      if (!redirectUrl) {
        // 302 without redirect URL means login failed
        logger.warn("Login failed: 302 response without redirect URL");
        if (userId) {
          await deleteToken(userId, "jp");
        }
        return {
          isValid: false,
          error: "Login failed. Please check your username and password.",
        };
      }

      if (redirectUrl.includes("https://maimaidx.jp/maimai-mobile/aimeList/")) {
        // Login successful
        const aimeListSubmitUrl = "https://maimaidx.jp/maimai-mobile/aimeList/submit/?idx=0";
        logger.debug({ url: aimeListSubmitUrl }, "Login successful, using aimeList submit URL");

        return {
          isValid: true,
          redirectUrl: aimeListSubmitUrl,
          cookies: cookies,
        };
      } else {
        // Unexpected redirect URL
        logger.warn({ url: redirectUrl }, "Login failed: unexpected redirect URL");
        if (userId) {
          await deleteToken(userId, "jp");
        }
        return {
          isValid: false,
          error: "Login failed. Please check your username and password.",
        };
      }
    } else {
      // Login failed with non-302 status
      logger.warn({ status: response.status }, "Japan account login failed");
      if (userId) {
        await deleteToken(userId, "jp");
      }
      return {
        isValid: false,
        error: "Login failed. Please check your username and password.",
      };
    }
  } catch (error) {
    // Being throttled says nothing about the user's credentials.
    if (error instanceof MaimaiLockedError || error instanceof MaimaiBusyError) throw error;
    logger.error({ err: error }, "Error during Japan account login");
    if (userId) {
      await deleteToken(userId, "jp");
    }
    return {
      isValid: false,
      error: "Failed to login. Please try again later.",
    };
  }
}

async function performInternationalAccountLogin(
  userId: string | null,
  username: string,
  password: string
): Promise<TokenValidationResult> {
  const loginPageUrl = "https://lng-tgk-aime-gw.am-all.net/common_auth/login?site_id=maimaidxex&redirect_url=https://maimaidx-eng.com/maimai-mobile/&back_url=https://maimai.sega.com/";
  const loginUrl = "https://lng-tgk-aime-gw.am-all.net/common_auth/login/sid";

  logger.info({ userId, region: "intl" }, "Attempting account login");

  try {
    // Step 1: Get the login page to obtain JSESSIONID
    logger.debug("Step 1: fetching login page to get JSESSIONID");
    const loginPageResponse = await fetch(loginPageUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      redirect: "manual", // Don't follow redirects
    });

    logger.debug({ status: loginPageResponse.status }, "Login page fetched");

    // Extract cookies from Set-Cookie headers
    let setCookieHeaders: string[] = [];
    if (loginPageResponse.headers.getSetCookie) {
      setCookieHeaders = loginPageResponse.headers.getSetCookie();
    } else {
      // Fallback for environments that don't support getSetCookie()
      const cookieHeader = loginPageResponse.headers.get('set-cookie');
      if (cookieHeader) {
        setCookieHeaders = [cookieHeader];
      }
    }

    if (setCookieHeaders.length === 0) {
      logger.warn("No Set-Cookie headers in login page response");
      if (userId) {
        await deleteToken(userId, "intl");
      }
      return {
        isValid: false,
        error: "Failed to obtain session cookies. Please try again later.",
      };
    }

    // Parse all cookies into a cookie bag
    const cookieBag = setCookieHeaders.map(header => {
      return header.split(';')[0];
    }).join('; ');

    logger.debug({ count: setCookieHeaders.length }, "Collected cookies from login page");

    // Step 2: POST credentials with JSESSIONID cookie
    logger.debug("Step 2: posting credentials with JSESSIONID");
    const params = new URLSearchParams({
      retention: '1',
      sid: username,
      password: password
    });

    const response = await fetch(`${loginUrl}?${params.toString()}`, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Cookie": cookieBag,
      },
      redirect: "manual", // Don't follow redirects
    });

    logger.debug({ status: response.status }, "Account login response");

    if (response.status === 302) {
      // Login successful, extract clal cookie from Set-Cookie header
      const loginSetCookieHeader = response.headers.get("Set-Cookie");

      if (loginSetCookieHeader) {
        // Extract clal cookie value
        const clalMatch = loginSetCookieHeader.match(/clal=([^;]+)/);
        if (clalMatch) {
          const clalValue = clalMatch[1];
          logger.debug("Extracted clal cookie from login response");

          // Update token in database with new format including cookie
          const newToken = `account://${clalValue}:://${username}:://${password}`;

          if (userId) {
            // Encrypt the token before storing
            const encryptedToken = encryptToken(newToken);

            await db
              .update(userTokens)
              .set({
                token: encryptedToken,
                updatedAt: new Date()
              })
              .where(
                and(
                  eq(userTokens.userId, userId),
                  eq(userTokens.region, "intl")
                )
              );
          }

          logger.debug("Token updated in database with extracted cookie");

          // Get redirect URL for validation result
          const redirectUrl = response.headers.get("Location");
          logger.debug({ url: redirectUrl }, "Account login successful");

          return {
            isValid: true,
            redirectUrl: redirectUrl || undefined,
            token: clalValue,
          };
        } else {
          logger.warn("Could not extract clal cookie from Set-Cookie header");
          return {
            isValid: false,
            error: "maimai accepted your credentials but did not return a session cookie. This is usually a temporary upstream issue. Please try again in a few minutes. If it still fails, resubmit a token via Settings (top-right profile icon) > Fetch.",
          };
        }
      } else {
        logger.warn("No Set-Cookie header in login response");
        return {
          isValid: false,
          error: "maimai accepted your credentials but did not return a session cookie. This is usually a temporary upstream issue. Please try again in a few minutes. If it still fails, resubmit a token via Settings (top-right profile icon) > Fetch.",
        };
      }
    } else {
      // Login failed
      logger.warn({ status: response.status }, "Account login failed");
      if (userId) {
        await deleteToken(userId, "intl");
      }
      return {
        isValid: false,
        error: "Login failed. Please check your username and password.",
      };
    }
  } catch (error) {
    logger.error({ err: error }, "Error during account login");
    if (userId) {
      await deleteToken(userId, "intl");
    }
    return {
      isValid: false,
      error: "Failed to login. Please try again later.",
    };
  }
}

export async function validateInternationalMaimaiToken(
  userId: string | null,
  token: string,
  deleteIfFailed: boolean = true
): Promise<TokenValidationResult> {
  const loginUrl = "https://lng-tgk-aime-gw.am-all.net/common_auth/login?site_id=maimaidxex&redirect_url=https://maimaidx-eng.com/maimai-mobile/&back_url=https://maimai.sega.com/";

  // Validate and sanitize the token
  const sanitizedToken = token.trim();

  // Check if token contains only ASCII characters
  if (!/^[\x00-\x7F]*$/.test(sanitizedToken)) {
    logger.warn("Token contains non-ASCII characters, removing from database");

    // Remove invalid token from database
    if (userId) {
      await deleteToken(userId, "intl");
    }

    return {
      isValid: false,
      error: "Invalid token format. Please ensure you copied the clal cookie correctly (ASCII characters only).",
    };
  }

  // Check if token is not empty
  if (!sanitizedToken) {
    logger.warn("Empty token provided, removing from database");

    // Remove empty token from database
    if (userId) {
      await deleteToken(userId, "intl");
    }

    return {
      isValid: false,
      error: "Token cannot be empty.",
    };
  }

  logger.debug({ userId, region: "intl", count: sanitizedToken.length }, "Validating token");

  try {
    const response = await fetch(loginUrl, {
      method: "GET",
      headers: {
        "Cookie": `clal=${sanitizedToken}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      redirect: "manual", // Don't follow redirects
    });

    logger.debug({ status: response.status }, "Token validation response");

    if (response.status === 302) {
      // Token is valid, get redirect URL
      const redirectUrl = response.headers.get("Location");
      logger.debug({ url: redirectUrl }, "Token validation successful");

      return {
        isValid: true,
        redirectUrl: redirectUrl || undefined,
      };
    } else if (response.status === 200) {
      // Token expired
      logger.warn("Token expired");

      // Only delete if deleteIfFailed is true
      if (deleteIfFailed && userId) {
        logger.debug("Deleting expired token from database");
        await deleteToken(userId, "intl");
      }

      return {
        isValid: false,
        error: "Token has expired. Please provide a new token.",
      };
    } else {
      // Unexpected status code
      logger.warn({ status: response.status }, "Unexpected response from token validation");
      return {
        isValid: false,
        error: `Unexpected response from SEGA servers (${response.status})`,
      };
    }
  } catch (error) {
    logger.error({ err: error }, "Error validating token");
    return {
      isValid: false,
      error: "Failed to validate token. Please try again later.",
    };
  }
}

export async function getCookiesFromRedirect(region: Region, redirectUrl: string, redirectCookies: string | null): Promise<string> {
  logger.debug({ region, url: redirectUrl }, "Fetching redirect URL to get login cookies");
  return openMaimaiSession(region, redirectUrl, redirectCookies);
}

export async function loginAndGetCookies(region: Region, maimaiToken: string): Promise<string> {
  const validation = await processMaimaiToken(null, region, maimaiToken);

  if (!validation.isValid) {
    throw new Error(validation.error || "Token validation failed");
  }

  if (!validation.redirectUrl) {
    throw new Error("No redirect URL received from token validation");
  }

  logger.info({ region }, "Token validation successful, getting cookies from redirect URL");
  return await getCookiesFromRedirect(region, validation.redirectUrl, validation.cookies || null);
}
