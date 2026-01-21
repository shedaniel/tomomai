import { db } from "./db";
import { userTokens, userSnapshots, songs, userScores, fetchSessions, userEvents, userRecentSongs, userRecentSongsDetailed, userAlbums } from "./db/schema-pg";
import { eq, and, or } from "drizzle-orm";
import { load } from "cheerio";
import { nanoid } from "nanoid";
import { getCurrentVersion } from "./metadata";
import { Agent } from "undici";
import { FETCH_STATES, getStateForDifficulty } from "./fetch-states";
import { appendFetchState } from "./fetch-states-server";
import { normalizeName } from "./name-utils";
import { splitSongs } from "./rating-calculator";
import { FullCombo, FullSync, Region, SongType, SongWithScore, TitleType } from "./types";
import { decryptToken, encryptToken } from "./token-crypto";
import { logger } from "./logger";
import { Difficulty } from "./types";
import { uploadToR2, deleteFromR2 } from "./r2";
import { convertJpegToAvif, fetchImageBuffer } from "./image-converter";

export const AGENT = new Agent({
  connect: {
    rejectUnauthorized: false
  }
});

export interface TokenValidationResult {
  isValid: boolean;
  redirectUrl?: string;
  error?: string;
  cookies?: string;
  token?: string;
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
      logger.info(`Trying to validate existing cookie for user ${userId}`);
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

  // Invalid token format
  logger.info("Invalid token format, removing from database");
  if (userId) {
    await deleteToken(userId, region);
  }
  return {
    isValid: false,
    error: "Invalid token format. Token must start with 'cookie://' or 'account://'",
  };
}

async function deleteToken(userId: string, region: Region): Promise<void> {
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

  logger.info(`Attempting Japan account login for user ${userId} with username ${username}`);

  try {
    // Step 1: Get the maimai mobile page to obtain _t token and cookies
    logger.info("Step 1: Fetching maimai mobile page to get _t token and cookies");
    const maimaiPageResponse = await fetch(maimaiMobileUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      redirect: "manual", // Don't follow redirects
      ...{ dispatcher: AGENT },
    });

    logger.debug(`Maimai mobile page response status: ${maimaiPageResponse.status}`);

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
        logger.debug(`Extracted _t token: ${tToken.substring(0, 10)}...`);
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

    logger.debug(`Parsed cookies for login request: ${cookies.substring(0, 50)}...`);

    // Step 2: POST credentials with all cookies and _t token
    logger.info("Step 2: Posting credentials with cookies and _t token");
    const formData = new URLSearchParams({
      segaId: username,
      password: password,
      token: tToken
    });

    const response = await fetch(submitUrl, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Cookie": cookies,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": maimaiMobileUrl,
      },
      body: formData.toString(),
      redirect: "manual", // Don't follow redirects
      ...{ ...{ dispatcher: AGENT }, },
    });

    logger.debug(`Japan account login response status: ${response.status}`);

    if (response.status === 302) {
      // Check redirect URL
      const redirectUrl = response.headers.get("Location");
      logger.debug(`Login redirect URL: ${redirectUrl}`);

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
        logger.debug("Login successful, redirecting to aimeList");

        // Return success with the aimeList submit URL and cookies
        const aimeListSubmitUrl = "https://maimaidx.jp/maimai-mobile/aimeList/submit/?idx=0";
        logger.debug(`Login successful. Using aimeList submit URL: ${aimeListSubmitUrl}`);

        return {
          isValid: true,
          redirectUrl: aimeListSubmitUrl,
          cookies: cookies,
        };
      } else {
        // Unexpected redirect URL
        logger.warn(`Unexpected redirect URL: ${redirectUrl}`);
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
      logger.warn(`Japan account login failed with status: ${response.status}`);
      if (userId) {
        await deleteToken(userId, "jp");
      }
      return {
        isValid: false,
        error: "Login failed. Please check your username and password.",
      };
    }
  } catch (error) {
    logger.error(error, "Error during Japan account login");
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
  const loginUrl = "https://lng-tgk-aime-gw.am-all.net/common_auth/login/sid/";

  logger.info(`Attempting account login for user ${userId} with username ${username}`);

  try {
    // Step 1: Get the login page to obtain JSESSIONID
    logger.info("Step 1: Fetching login page to get JSESSIONID");
    const loginPageResponse = await fetch(loginPageUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      redirect: "manual", // Don't follow redirects
    });

    logger.debug(`Login page response status: ${loginPageResponse.status}`);

    // Extract JSESSIONID from Set-Cookie header
    const setCookieHeader = loginPageResponse.headers.get("Set-Cookie");
    let jsessionId = "";

    if (setCookieHeader) {
      const jsessionMatch = setCookieHeader.match(/JSESSIONID=([^;]+)/);
      if (jsessionMatch) {
        jsessionId = jsessionMatch[1];
        logger.debug(`Extracted JSESSIONID: ${jsessionId.substring(0, 10)}...`);
      } else {
        logger.warn("Could not extract JSESSIONID from Set-Cookie header");
        if (userId) {
          await deleteToken(userId, "intl");
        }
        return {
          isValid: false,
          error: "Failed to obtain session ID. Please try again later.",
        };
      }
    } else {
      logger.warn("No Set-Cookie header in login page response");
      if (userId) {
        await deleteToken(userId, "intl");
      }
      return {
        isValid: false,
        error: "Failed to obtain session ID. Please try again later.",
      };
    }

    // Step 2: POST credentials with JSESSIONID cookie
    logger.debug("Step 2: Posting credentials with JSESSIONID");
    const params = new URLSearchParams({
      retention: '1',
      sid: username,
      password: password
    });

    const response = await fetch(`${loginUrl}?${params.toString()}`, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Cookie": `JSESSIONID=${jsessionId}`,
      },
      redirect: "manual", // Don't follow redirects
    });

    logger.debug(`Account login response status: ${response.status}`);

    if (response.status === 302) {
      // Login successful, extract clal cookie from Set-Cookie header
      const loginSetCookieHeader = response.headers.get("Set-Cookie");
      logger.debug(`Login Set-Cookie header: ${loginSetCookieHeader}`);

      if (loginSetCookieHeader) {
        // Extract clal cookie value
        const clalMatch = loginSetCookieHeader.match(/clal=([^;]+)/);
        if (clalMatch) {
          const clalValue = clalMatch[1];
          logger.debug(`Extracted clal cookie: ${clalValue.substring(0, 10)}...`);

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
          logger.debug(`Login successful. Redirect URL: ${redirectUrl}`);

          return {
            isValid: true,
            redirectUrl: redirectUrl || undefined,
            token: clalValue,
          };
        } else {
          logger.warn("Could not extract clal cookie from Set-Cookie header");
          if (userId) {
            await deleteToken(userId, "intl");
          }
          return {
            isValid: false,
            error: "Login successful but could not extract authentication cookie.",
          };
        }
      } else {
        logger.warn("No Set-Cookie header in login response");
        if (userId) {
          await deleteToken(userId, "intl");
        }
        return {
          isValid: false,
          error: "Login successful but no authentication cookie received.",
        };
      }
    } else {
      // Login failed
      logger.warn(`Account login failed with status: ${response.status}`);
      if (userId) {
        await deleteToken(userId, "intl");
      }
      return {
        isValid: false,
        error: "Login failed. Please check your username and password.",
      };
    }
  } catch (error) {
    logger.error(error, "Error during account login");
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

  logger.debug(`Validating token for user ${userId} in intl region (token length: ${sanitizedToken.length})`);

  try {
    const response = await fetch(loginUrl, {
      method: "GET",
      headers: {
        "Cookie": `clal=${sanitizedToken}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      redirect: "manual", // Don't follow redirects
    });

    logger.debug(`Token validation response status: ${response.status}`);

    if (response.status === 302) {
      // Token is valid, get redirect URL
      const redirectUrl = response.headers.get("Location");
      logger.debug(`Token validation successful. Redirect URL: ${redirectUrl}`);

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
      logger.warn(`Unexpected response status: ${response.status}`);
      return {
        isValid: false,
        error: `Unexpected response from SEGA servers (${response.status})`,
      };
    }
  } catch (error) {
    logger.error(error, "Error validating token");
    return {
      isValid: false,
      error: "Failed to validate token. Please try again later.",
    };
  }
}

async function fetchPlayerDataWithLogin(region: Region, redirectUrl: string, redirectCookies: string | null): Promise<{ html: string; cookies: string }> {
  // Step 1: Follow the redirect URL to get login cookies
  logger.debug(`Fetching redirect URL to get login cookies: ${redirectUrl}`);

  const loginResponse = await fetch(redirectUrl, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      ...(redirectCookies ? { "Cookie": redirectCookies } : {}),
    },
    redirect: "manual", // Don't follow redirects
    ...{ dispatcher: AGENT },
  });

  logger.debug(`Login response status: ${loginResponse.status}`);

  // Extract Set-Cookie headers
  let setCookieHeaders: string[] = [];
  if (loginResponse.headers.getSetCookie) {
    setCookieHeaders = loginResponse.headers.getSetCookie();
  } else {
    // Fallback for environments that don't support getSetCookie()
    const cookieHeader = loginResponse.headers.get('set-cookie');
    if (cookieHeader) {
      setCookieHeaders = [cookieHeader];
    }
  }

  if (setCookieHeaders.length === 0) {
    throw new Error("No cookies received from login redirect");
  }

  logger.debug(`Received ${setCookieHeaders.length} cookies from login`);

  // Parse cookies into a single Cookie header value
  const cookies = setCookieHeaders.map(header => {
    // Extract just the name=value part (before first semicolon)
    const cookiePart = header.split(';')[0];
    return cookiePart;
  }).join('; ');

  logger.debug(`Parsed cookies for player data request`);

  // Step 2: Fetch player data using the login cookies
  const playerDataUrl = region === "jp"
    ? "https://maimaidx.jp/maimai-mobile/playerData/"
    : "https://maimaidx-eng.com/maimai-mobile/playerData/";
  logger.debug(`Fetching player data from: ${playerDataUrl}`);

  const playerDataResponse = await fetch(playerDataUrl, {
    method: "GET",
    headers: {
      "Cookie": cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Referer": redirectUrl,
    },
    ...{ dispatcher: AGENT },
  });

  logger.debug(`Player data response status: ${playerDataResponse.status}`);

  if (playerDataResponse.status !== 200) {
    throw new Error(`Failed to fetch player data: HTTP ${playerDataResponse.status}`);
  }

  const playerDataHtml = await playerDataResponse.text();
  logger.debug(`Player data HTML length: ${playerDataHtml.length} characters`);

  // Check for error in response
  if (playerDataHtml.includes("ERROR CODE：100001") || playerDataHtml.includes("Please login again")) {
    throw new Error("Session expired or invalid. Please provide a new token.");
  }

  return { html: playerDataHtml, cookies };
}

// Parse score data from HTML for a specific difficulty
function parseScoreData(html: string, difficulty: number): ScoreData[] {
  const $ = load(html);

  // Use correct selector based on difficulty
  const difficultySelectors = [
    ".music_basic_score_back",      // difficulty 0
    ".music_advanced_score_back",   // difficulty 1
    ".music_expert_score_back",     // difficulty 2
    ".music_master_score_back",     // difficulty 3
    ".music_remaster_score_back"    // difficulty 4
  ];

  const selector = difficultySelectors[difficulty];
  if (!selector) {
    logger.error(`Invalid difficulty: ${difficulty}`);
    return [];
  }

  const blocks = $(selector);
  const scores: ScoreData[] = [];

  logger.debug(`Found ${blocks.length} score blocks for difficulty ${difficulty} using selector ${selector}`);

  blocks.each((index, element) => {
    try {
      const block = $(element);

      // Only consider blocks that contain .music_score_block (played songs)
      const scoreBlocks = block.find('.music_score_block');
      if (scoreBlocks.length === 0) {
        return; // Skip unplayed songs
      }

      const parent = block.parent();

      // Extract music type (dx/std) from icon image
      const iconElement = parent.find('img.music_kind_icon');
      if (iconElement.length === 0) {
        logger.warn(`No music kind icon found for score block ${index}`);
        return;
      }

      const iconSrc = iconElement.attr('src');
      if (!iconSrc) {
        logger.warn(`No src attribute found for music kind icon in score block ${index}`);
        return;
      }

      let musicType: SongType;
      if (iconSrc.includes('music_dx.png')) {
        musicType = "dx";
      } else if (iconSrc.includes('music_standard.png')) {
        musicType = "std";
      } else {
        logger.warn(`Unknown music type icon: ${iconSrc} in score block ${index}`);
        return;
      }

      // Extract song name
      const nameElement = block.find('.music_name_block');
      if (nameElement.length === 0) {
        logger.warn(`No music name block found for score block ${index}`);
        return;
      }
      const songName = normalizeName(nameElement.text().trim());

      // Extract level
      const levelElement = block.find('.music_lv_block');
      if (levelElement.length === 0) {
        logger.warn(`No music level block found for score block ${index}`);
        return;
      }
      const level = levelElement.text().trim();

      // Extract achievement and dx score from the two .music_score_block elements
      if (scoreBlocks.length < 2) {
        logger.warn(`Expected 2 score blocks, found ${scoreBlocks.length} for song ${songName}`);
        return;
      }

      // First score block: achievement (e.g., "97.6977%")
      const achievementText = scoreBlocks.eq(0).text().trim();
      const achievementMatch = achievementText.match(/(\d+\.?\d*)%/);
      if (!achievementMatch) {
        logger.warn(`Could not parse achievement: ${achievementText} for song ${songName}`);
        return;
      }
      const achievementFloat = parseFloat(achievementMatch[1]);
      const achievement = Math.round(achievementFloat * 10000); // Convert to 10000x format

      // Second score block: dx score (e.g., "758 / 963")
      const dxScoreText = scoreBlocks.eq(1).text().trim();
      const dxScoreMatch = dxScoreText.match(/(\d+)\s*\/\s*\d+/);
      if (!dxScoreMatch) {
        logger.warn(`Could not parse dx score: ${dxScoreText} for song ${songName}`);
        return;
      }
      const dxScore = parseInt(dxScoreMatch[1], 10);

      // Extract fs and fc from the three .h_30 elements
      const h30Elements = block.find('.h_30');
      if (h30Elements.length < 2) {
        logger.warn(`Expected at least 2 h_30 elements, found ${h30Elements.length} for song ${songName}`);
        return;
      }

      // First .h_30 is fs (sync status)
      let fs: "none" | "sync" | "fs" | "fs+" | "fdx" | "fdx+" = "none";
      const fsElement = h30Elements.eq(0);
      const fsSrc = fsElement.attr('src');
      if (fsSrc) {
        if (fsSrc.includes('_fdxp.png')) {
          fs = "fdx+";
        } else if (fsSrc.includes('_fdx.png')) {
          fs = "fdx";
        } else if (fsSrc.includes('_fsp.png')) {
          fs = "fs+";
        } else if (fsSrc.includes('_fs.png')) {
          fs = "fs";
        } else if (fsSrc.includes('_sync.png')) {
          fs = "sync";
        }
      }

      // Second .h_30 is fc (full combo status)
      let fc: "none" | "fc" | "fc+" | "ap" | "ap+" = "none";
      const fcElement = h30Elements.eq(1);
      const fcSrc = fcElement.attr('src');
      if (fcSrc) {
        if (fcSrc.includes('_app.png')) {
          fc = "ap+";
        } else if (fcSrc.includes('_ap.png')) {
          fc = "ap";
        } else if (fcSrc.includes('_fcp.png')) {
          fc = "fc+";
        } else if (fcSrc.includes('_fc.png')) {
          fc = "fc";
        }
      }

      // Map difficulty number to difficulty name
      const difficultyNames: Difficulty[] = ["basic", "advanced", "expert", "master", "remaster"];
      const difficultyName = difficultyNames[difficulty] || "basic";

      const scoreData: ScoreData = {
        songName,
        level,
        musicType,
        difficulty: difficultyName,
        difficultyNumber: difficulty,
        achievement,
        dxScore,
        fc,
        fs,
      };

      scores.push(scoreData);

      logger.debug(`Extracted score ${index}: ${songName} (${level}, ${musicType}, ${difficultyName}) - ${achievementFloat}%, ${dxScore} dx, ${fc}/${fs}`);
    } catch (error) {
      logger.error(error, `Error processing score block ${index}`);
    }
  });

  logger.info(`Successfully extracted ${scores.length} scores for difficulty ${difficulty}`);
  return scores;
}

// Fetch songs data for a specific difficulty using existing cookies
async function fetchSongsData(cookies: string, difficulty: number, region: Region): Promise<ScoreData[]> {
  const baseUrl = region === "jp" ? "https://maimaidx.jp" : "https://maimaidx-eng.com";
  const songsUrl = `${baseUrl}/maimai-mobile/record/musicGenre/search/?genre=99&diff=${difficulty}`;
  logger.info(`Fetching songs data for difficulty ${difficulty} from: ${songsUrl}`);

  const songsResponse = await fetch(songsUrl, {
    method: "GET",
    headers: {
      "Cookie": cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Referer": `${baseUrl}/maimai-mobile/`,
    },
    ...{ dispatcher: AGENT },
  });

  logger.debug(`Songs data response status for difficulty ${difficulty}: ${songsResponse.status}`);

  if (songsResponse.status !== 200) {
    throw new Error(`Failed to fetch songs data for difficulty ${difficulty}: HTTP ${songsResponse.status}`);
  }

  const songsHtml = await songsResponse.text();
  logger.debug(`Songs data for difficulty ${difficulty} fetched successfully, length: ${songsHtml.length} characters`);

  // Parse the HTML to extract score data
  const scoreData = parseScoreData(songsHtml, difficulty);

  return scoreData;
}

// Fetch all songs data for all difficulties (0-4)
async function fetchAllSongsData(cookies: string, region: Region, sessionId?: bigint): Promise<{ [difficulty: number]: ScoreData[] }> {
  logger.info(`Fetching songs data for all difficulties (0-4)${sessionId ? ' with tracking' : ''}`);

  // Create promises for all difficulties to fetch concurrently
  const difficultyPromises = Array.from({ length: 5 }, (_, difficulty) => {
    return fetchSongsData(cookies, difficulty, region).then((scoreData) => {
      logger.info(`Successfully fetched ${scoreData.length} scores for difficulty ${difficulty}`);

      // Track progress if sessionId is provided
      if (sessionId) {
        const state = getStateForDifficulty(difficulty);
        if (state) {
          appendFetchState(sessionId, state); // Fire and forget
        }
      }

      return { difficulty, scoreData };
    }).catch((error) => {
      logger.error(error, `Failed to fetch songs for difficulty ${difficulty}`);
      throw new Error(`Failed to fetch songs for difficulty ${difficulty}: ${error instanceof Error ? error.message : "Unknown error"}`);
    });
  });

  // Wait for all difficulties to complete
  const results = await Promise.all(difficultyPromises);

  // Convert results back to the expected format
  const songsData: { [difficulty: number]: ScoreData[] } = {};
  for (const { difficulty, scoreData } of results) {
    songsData[difficulty] = scoreData;
  }

  logger.info(`Successfully fetched songs data for all difficulties`);
  return songsData;
}

async function fetchRecentSongsData(cookies: string, region: Region, sessionId: bigint): Promise<RecentSongData[]> {
  const baseUrl = region === "jp" ? "https://maimaidx.jp" : "https://maimaidx-eng.com";
  const recentSongsUrl = `${baseUrl}/maimai-mobile/record/`;
  logger.info(`Fetching recent songs data from: ${recentSongsUrl}`);

  const recentSongsResponse = await fetch(recentSongsUrl, {
    method: "GET",
    headers: {
      "Cookie": cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Referer": `${baseUrl}/maimai-mobile/`,
    },
    ...{ dispatcher: AGENT },
  });

  logger.debug(`Recent songs data response status: ${recentSongsResponse.status}`);

  if (recentSongsResponse.status !== 200) {
    throw new Error(`Failed to fetch recent songs data: HTTP ${recentSongsResponse.status}`);
  }

  const recentSongsHtml = await recentSongsResponse.text();
  logger.debug(`Recent songs data fetched successfully, length: ${recentSongsHtml.length} characters`);

  const $ = load(recentSongsHtml);
  const recentSongs: RecentSongData[] = [];

  // Parse each recent play record
  const records = $(".p_10.t_l.f_0.v_b");
  logger.debug(`Found ${records.length} recent play records`);

  records.each((index, element) => {
    try {
      const record = $(element);

      // Extract track number (e.g., "TRACK 01" -> 1)
      const trackText = record.find(".sub_title > .red").text().trim();
      const trackMatch = trackText.match(/TRACK\s+(\d+)/i);
      if (!trackMatch) {
        logger.warn(`Could not parse track number from: ${trackText}`);
        return;
      }
      const track = parseInt(trackMatch[1], 10);

      // Extract play time (JST format: "2025/11/02 19:23")
      const playTimeText = record.find(".sub_title > .v_b:not(.red)").text().trim();
      const playTimeMatch = playTimeText.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
      if (!playTimeMatch) {
        logger.warn(`Could not parse play time from: ${playTimeText}`);
        return;
      }
      const [, year, month, day, hour, minute] = playTimeMatch;
      // Parse as JST (UTC+9)
      const playedAt = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);

      // Extract level string (e.g., "13+")
      const level = record.find(".music_lv_back").text().trim();

      // Extract difficulty from playlog_diff image
      const diffImg = record.find("img.playlog_diff");
      const diffImgSrc = diffImg.attr("src") || "";
      let difficultyNumber = 0;
      let difficulty = "basic";

      if (diffImgSrc.includes("remaster")) {
        difficultyNumber = 4;
        difficulty = "remaster";
      } else if (diffImgSrc.includes("master")) {
        difficultyNumber = 3;
        difficulty = "master";
      } else if (diffImgSrc.includes("expert")) {
        difficultyNumber = 2;
        difficulty = "expert";
      } else if (diffImgSrc.includes("advanced")) {
        difficultyNumber = 1;
        difficulty = "advanced";
      } else if (diffImgSrc.includes("basic")) {
        difficultyNumber = 0;
        difficulty = "basic";
      }

      // Extract song name - text in .basic_block
      const basicBlock = record.find(".basic_block");
      let songName = "";
      basicBlock.contents().each((i, node) => {
        if (node.type === "text") {
          const text = $(node).text().trim();
          if (text) {
            songName = text;
          }
        }
      });
      songName = normalizeName(songName);

      if (!songName) {
        logger.warn(`Could not extract song name for record ${index}`);
        return;
      }

      // Extract achievement percentage (e.g., "99.2384%")
      const achievementText = record.find(".playlog_achievement_txt").text().trim();
      const achievementMatch = achievementText.match(/(\d+\.?\d*)%/);
      if (!achievementMatch) {
        logger.warn(`Could not parse achievement from: ${achievementText}`);
        return;
      }
      const achievementFloat = parseFloat(achievementMatch[1]);
      const achievement = Math.round(achievementFloat * 10000); // Convert to 10000x format

      // Extract DX score (e.g., "1,483 / 1,722")
      const dxScoreText = record.find(".playlog_score_block > .f_15").text().trim();
      const dxScoreMatch = dxScoreText.match(/(\d+(?:,\d+)?)\s*\/\s*(\d+(?:,\d+)?)/);
      if (!dxScoreMatch) {
        logger.warn(`Could not parse DX score from: ${dxScoreText}`);
        return;
      }
      const dxScore = parseInt(dxScoreMatch[1].replace(/,/g, ''), 10);
      const maxDxScore = parseInt(dxScoreMatch[2].replace(/,/g, ''), 10);

      // Extract FC and FS status from result images
      const resultImages = record.find(".playlog_result_innerblock > img");

      let fc: "none" | "fc" | "fc+" | "ap" | "ap+" = "none";
      let fs: "none" | "sync" | "fs" | "fs+" | "fdx" | "fdx+" = "none";

      // First image is FC status
      if (resultImages.length > 0) {
        const fcSrc = $(resultImages[0]).attr("src") || "";
        if (fcSrc.includes("applus.png") || fcSrc.includes("app.png")) {
          fc = "ap+";
        } else if (fcSrc.includes("ap.png")) {
          fc = "ap";
        } else if (fcSrc.includes("fcplus.png") || fcSrc.includes("fcp.png")) {
          fc = "fc+";
        } else if (fcSrc.includes("fc.png")) {
          fc = "fc";
        }
      }

      // Second image is FS status
      if (resultImages.length > 1) {
        const fsSrc = $(resultImages[1]).attr("src") || "";
        if (fsSrc.includes("fsdplus.png")) {
          fs = "fdx+";
        } else if (fsSrc.includes("fsd.png")) {
          fs = "fdx";
        } else if (fsSrc.includes("fsplus.png") || fsSrc.includes("fsp.png")) {
          fs = "fs+";
        } else if (fsSrc.includes("fs.png")) {
          fs = "fs";
        } else if (fsSrc.includes("sync.png")) {
          fs = "sync";
        }
      }

      // Determine music type (dx/std) from playlog_music_kind_icon
      const musicKindIcon = record.find("img.playlog_music_kind_icon");
      let musicType: SongType = "std";
      if (musicKindIcon.length > 0) {
        const iconSrc = musicKindIcon.attr("src") || "";
        if (iconSrc.includes("music_dx.png")) {
          musicType = "dx";
        } else if (iconSrc.includes("music_standard.png")) {
          musicType = "std";
        }
      }

      // Extract idx value for playlog detail page
      const idxInput = record.find("input[name='idx']");
      const idx = idxInput.attr("value") || "";
      if (!idx) {
        logger.warn(`Could not extract idx value for record ${index}`);
        return;
      }

      const recentSong: RecentSongData = {
        songName,
        level,
        musicType,
        difficulty,
        difficultyNumber,
        achievement,
        dxScore,
        maxDxScore,
        fc,
        fs,
        track,
        playedAt,
        idx,
      };

      recentSongs.push(recentSong);
      logger.debug(`Extracted recent play ${index}: ${songName} (Track ${track}, ${level}, ${difficulty}) - ${achievementFloat}%, ${dxScore}/${maxDxScore}`);

    } catch (error) {
      logger.error(error, `Error processing recent play record ${index}`);
    }
  });

  logger.info(`Successfully extracted ${recentSongs.length} recent plays`);
  return recentSongs;
}

// Fetch hidden songs data from rating target music page (intl only)
async function fetchHiddenSongsData(cookies: string, allSongsData: { [difficulty: number]: ScoreData[] }): Promise<ScoreData[]> {
  logger.info("Fetching hidden songs data from rating target music page...");

  const hiddenSongsUrl = "https://maimaidx-eng.com/maimai-mobile/home/ratingTargetMusic/";

  const response = await fetch(hiddenSongsUrl, {
    method: "GET",
    headers: {
      "Cookie": cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Referer": "https://maimaidx-eng.com/maimai-mobile/",
    },
  });

  logger.debug(`Hidden songs data response status: ${response.status}`);

  if (response.status !== 200) {
    throw new Error(`Failed to fetch hidden songs data: HTTP ${response.status}`);
  }

  const html = await response.text();
  logger.debug(`Hidden songs data fetched successfully, length: ${html.length} characters`);

  const $ = load(html);
  const hiddenSongs: ScoreData[] = [];

  // Define difficulty selectors and their corresponding numbers
  const difficultyInfo: { selector: string, difficulty: Difficulty, difficultyNumber: number }[] = [
    { selector: ".music_basic_score_back", difficulty: "basic", difficultyNumber: 0 },
    { selector: ".music_advanced_score_back", difficulty: "advanced", difficultyNumber: 1 },
    { selector: ".music_expert_score_back", difficulty: "expert", difficultyNumber: 2 },
    { selector: ".music_master_score_back", difficulty: "master", difficultyNumber: 3 },
    { selector: ".music_remaster_score_back", difficulty: "remaster", difficultyNumber: 4 }
  ];

  // Process each difficulty
  for (const { selector, difficulty, difficultyNumber } of difficultyInfo) {
    const blocks = $(selector);
    logger.debug(`Found ${blocks.length} score blocks for ${difficulty} difficulty`);

    blocks.each((index, element) => {
      try {
        const block = $(element);

        // Extract song name
        const nameElement = block.find('.music_name_block');
        if (nameElement.length === 0) {
          logger.warn(`No music name block found for ${difficulty} score block ${index}`);
          return;
        }
        const songName = normalizeName(nameElement.text().trim());

        // Extract music type (dx/std) from icon image
        const iconElement = block.find('img.music_kind_icon');
        if (iconElement.length === 0) {
          logger.warn(`No music kind icon found for ${difficulty} score block ${index}: ${songName}`);
          return;
        }

        const iconSrc = iconElement.attr('src');
        if (!iconSrc) {
          logger.warn(`No src attribute found for music kind icon in ${difficulty} score block ${index}: ${songName}`);
          return;
        }

        let musicType: SongType;
        if (iconSrc.includes('music_dx.png')) {
          musicType = "dx";
        } else if (iconSrc.includes('music_standard.png')) {
          musicType = "std";
        } else {
          logger.warn(`Unknown music type icon: ${iconSrc} for ${difficulty} score block ${index}: ${songName}`);
          return;
        }

        // Check if this song already exists in allSongsData
        const existingSongs = allSongsData[difficultyNumber] || [];
        const songExists = existingSongs.some(song =>
          song.songName === songName && song.musicType === musicType
        );

        if (songExists) {
          // Song already exists, skip it
          return;
        }

        // This is a hidden song! Extract achievement from music_score_block
        const scoreBlocks = block.find('.music_score_block');
        let achievement = 0;

        if (scoreBlocks.length > 0) {
          const achievementText = scoreBlocks.eq(0).text().trim();
          const achievementMatch = achievementText.match(/(\d+\.?\d*)%/);
          if (achievementMatch) {
            const achievementFloat = parseFloat(achievementMatch[1]);
            achievement = Math.round(achievementFloat * 10000); // Convert to 10000x format
          }
        }

        // Create ScoreData for hidden song
        const hiddenSongData: ScoreData = {
          songName,
          level: "0",
          musicType,
          difficulty,
          difficultyNumber,
          achievement,
          dxScore: 0,
          fc: "none",
          fs: "none"
        };

        hiddenSongs.push(hiddenSongData);
        logger.debug(`Found hidden song: ${songName} (${musicType}, ${difficulty}) - ${achievement / 10000}%`);

      } catch (error) {
        logger.error(error, `Error processing hidden song ${difficulty} score block ${index}`);
      }
    });
  }

  logger.info(`Successfully found ${hiddenSongs.length} hidden songs`);
  return hiddenSongs;
}

interface PlayerData {
  iconUrl: string;
  iconBase64: string;
  displayName: string;
  rating: number;
  title: string;
  titleType: TitleType;
  stars: number;
  versionPlayCount: number;
  totalPlayCount: number;
  courseRankUrl: string;
  classRankUrl: string;
}

interface ScoreData {
  songName: string;
  level: string;
  musicType: SongType;
  difficulty: Difficulty;
  difficultyNumber: number;
  achievement: number; // stored as 10000x
  dxScore: number;
  fc: FullCombo;
  fs: FullSync;
}

interface RecentSongData {
  songName: string;
  level: string;
  musicType: SongType;
  difficulty: string;
  difficultyNumber: number;
  achievement: number; // stored as 10000x
  dxScore: number;
  maxDxScore: number;
  fc: FullCombo;
  fs: FullSync;
  track: number;
  playedAt: Date;
  idx: string; // Form data for playlog detail page
}

interface AlbumData {
  songName: string;
  musicType: SongType;
  difficulty: Difficulty;
  takenAt: Date;
  imageUrl: string;
  venue: string | null;
}

async function fetchEventsData(cookies: string, region: Region, sessionId: bigint): Promise<{ areaEvents: EventData[], eventAreaEvents: EventAreaData[] }> {
  const baseUrl = region === "intl" ? "https://maimaidx-eng.com" : "https://maimaidx.jp";

  logger.info(`Starting events data fetch for ${region} region...`);

  try {
    // Fetch both area and event area concurrently
    const [areaResponse, eventAreaResponse] = await Promise.all([
      fetch(`${baseUrl}/maimai-mobile/map/`, {
        method: "GET",
        headers: {
          "Cookie": cookies,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Referer": `${baseUrl}/maimai-mobile/`,
        },
        ...{ dispatcher: AGENT },
      }),
      fetch(`${baseUrl}/maimai-mobile/map/eventMap/`, {
        method: "GET",
        headers: {
          "Cookie": cookies,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Referer": `${baseUrl}/maimai-mobile/`,
        },
        ...{ dispatcher: AGENT },
      })
    ]);

    if (areaResponse.status !== 200 || eventAreaResponse.status !== 200) {
      throw new Error(`Failed to fetch events data: area ${areaResponse.status}, event area ${eventAreaResponse.status}`);
    }

    const [areaHtml, eventAreaHtml] = await Promise.all([
      areaResponse.text(),
      eventAreaResponse.text()
    ]);

    // Parse area events
    const areaEvents = parseAreaEvents(areaHtml);
    logger.debug({ areaEvents }, `Parsed ${areaEvents.length} area events`);

    // Parse event area events
    const eventAreaEvents = parseEventAreaEvents(eventAreaHtml, region);
    logger.debug({ eventAreaEvents }, `Parsed ${eventAreaEvents.length} event area events`);

    return { areaEvents, eventAreaEvents };
  } catch (error) {
    logger.error(error, "Error fetching events data");
    throw error;
  }
}

interface EventData {
  name: string;
  currentDistance: number;
  nextRewardDistance: number | null;
  state: "not_started" | "in_progress" | "completed";
  imageUrl: string;
}

interface EventAreaData extends EventData {
  eventPeriod: [number, number] | null; // [startTimestamp, endTimestamp]
}

// Parse event period string and extract start/end timestamps
function parseEventPeriod(periodStr: string | null): [number, number] | null {
  if (!periodStr) return null;

  // Match pattern: "Event period：YYYY/MM/DD HH:mm～YYYY/MM/DD HH:mm"
  const match = periodStr.match(/Event period：(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})～(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);

  if (!match) {
    logger.warn(`Could not parse event period: ${periodStr}`);
    return null;
  }

  const [
    ,
    startYear, startMonth, startDay, startHour, startMin,
    endYear, endMonth, endDay, endHour, endMin
  ] = match;

  try {
    const startDate = new Date(`${startYear}-${startMonth}-${startDay}T${startHour}:${startMin}:00+09:00`);
    const endDate = new Date(`${endYear}-${endMonth}-${endDay}T${endHour}:${endMin}:00+09:00`);

    const startTimestamp = startDate.getTime();
    const endTimestamp = endDate.getTime();

    return [startTimestamp, endTimestamp];
  } catch (error) {
    logger.warn(`Failed to parse event period dates: ${error}`);
    return null;
  }
}

function parseAreaEvents(html: string): EventData[] {
  const $ = load(html);
  const events: EventData[] = [];

  const elements = $(".m_10.m_t_0.f_0");
  logger.debug(`Found ${elements.length} area elements`);

  elements.each((index, element) => {
    try {
      const $element = $(element);

      // Extract event name
      const nameElement = $element.find(".map_name_block_inner");
      const eventName = nameElement.text().trim();

      // Extract current distance and parse as number
      const basicBlock = $element.find(".basic_block");
      const currentDistanceStr = basicBlock.text().trim();
      const currentDistance = parseInt(currentDistanceStr.replace(/[^\d]/g, ''), 10) || 0;

      // Extract image URL
      const imageElement = $element.find("img.w_180");
      let imageUrl = "";
      if (imageElement.length > 0) {
        const imageSrc = imageElement.attr("src");
        if (imageSrc) {
          imageUrl = imageSrc.startsWith("http") ? imageSrc : `https://maimaidx-eng.com${imageSrc}`;
        }
      }

      // Extract next reward distance and state
      let nextRewardDistance: number | null = null;
      let state: "not_started" | "in_progress" | "completed" = "in_progress";

      const f11Element = $element.find(".f_11");
      if (f11Element.length > 0) {
        const f14Element = f11Element.find(".f_14");

        if (f14Element.length === 0) {
          // f_11 exists but f_14 doesn't - event not started by player
          state = "not_started";
        } else {
          const rewardText = f14Element.text().trim();

          if (rewardText === "--") {
            state = "completed";
            nextRewardDistance = null;
          } else {
            nextRewardDistance = parseInt(rewardText, 10) || null;
          }
        }
      }

      events.push({
        name: eventName,
        currentDistance,
        nextRewardDistance,
        state,
        imageUrl
      });
    } catch (error) {
      logger.error(error, `Error parsing area event ${index}`);
    }
  });

  return events;
}

function parseEventAreaEvents(html: string, region: Region = "intl"): EventAreaData[] {
  const $ = load(html);
  const events: EventAreaData[] = [];
  const baseUrl = region === "intl" ? "https://maimaidx-eng.com" : "https://maimaidx.jp";

  const elements = $(".eventmap_container");
  logger.debug(`Found ${elements.length} event area elements`);

  elements.each((index, element) => {
    try {
      const $element = $(element);

      // Extract event name
      const nameElement = $element.find(".map_name_block_inner");
      const eventName = nameElement.text().trim();

      // Extract event period
      const periodElement = $element.find(".t_r.f_11.white");
      const eventPeriod = periodElement.text().trim() || null;

      // Extract current distance and parse as number
      const basicBlock = $element.find(".basic_block");
      const currentDistanceStr = basicBlock.text().trim();
      const currentDistance = parseInt(currentDistanceStr.replace(/[^\d]/g, ''), 10) || 0;

      // Extract image URL
      const imageElement = $element.find("img.w_180");
      let imageUrl = "";
      if (imageElement.length > 0) {
        const imageSrc = imageElement.attr("src");
        if (imageSrc) {
          imageUrl = imageSrc.startsWith("http") ? imageSrc : `${baseUrl}${imageSrc}`;
        }
      }

      // Extract next reward distance and state
      let nextRewardDistance: number | null = null;
      let state: "not_started" | "in_progress" | "completed" = "in_progress";

      const f11Element = $element.find(".f_11");
      if (f11Element.length > 0) {
        const f14Element = f11Element.find(".f_14");

        if (f14Element.length === 0) {
          // f_11 exists but f_14 doesn't - event not started by player
          state = "not_started";
        } else {
          const rewardText = f14Element.text().trim();

          if (rewardText === "--") {
            state = "completed";
            nextRewardDistance = null;
          } else {
            nextRewardDistance = parseInt(rewardText, 10) || null;
          }
        }
      }

      events.push({
        name: eventName,
        currentDistance,
        nextRewardDistance,
        state,
        imageUrl,
        eventPeriod: parseEventPeriod(eventPeriod)
      });
    } catch (error) {
      logger.error(error, `Error parsing event area event ${index}`);
    }
  });

  return events;
}

async function extractPlayerData(region: Region, html: string, cookies: string): Promise<PlayerData> {
  const $ = load(html);
  const block = $('.see_through_block');

  if (block.length === 0) {
    throw new Error("Could not find .see_through_block in player data");
  }

  // Extract icon URL
  const iconElement = block.find('img.w_112');
  if (iconElement.length === 0) {
    throw new Error("Could not find user icon in player data");
  }

  const iconSrc = iconElement.attr('src');
  if (!iconSrc) {
    throw new Error("User icon element found but src attribute is missing");
  }

  const iconUrl = iconSrc.startsWith('http') ? iconSrc : `https://maimaidx-eng.com${iconSrc}`;
  logger.debug(`Extracted icon URL: ${iconUrl}`);

  // Extract display name
  const nameElement = block.find('.name_block');
  if (nameElement.length === 0) {
    throw new Error("Could not find .name_block in player data");
  }
  const displayName = nameElement.text().trim();
  logger.debug(`Extracted display name: ${displayName}`);

  // Extract rating
  const ratingElement = block.find('.rating_block');
  if (ratingElement.length === 0) {
    throw new Error("Could not find .rating_block in player data");
  }
  const ratingText = ratingElement.text().trim();
  const rating = parseInt(ratingText, 10);
  if (isNaN(rating)) {
    throw new Error(`Invalid rating format: ${ratingText}`);
  }
  logger.debug(`Extracted rating: ${rating}`);

  // Extract title and trophy type
  const titleElement = block.find('.trophy_block');
  if (titleElement.length === 0) {
    throw new Error("Could not find .trophy_block in player data");
  }
  const title = titleElement.text().trim();
  logger.debug(`Extracted title: ${title}`);

  // Extract trophy type from class (e.g., trophy_Gold -> gold)
  const titleElementClass = titleElement.attr('class') || '';
  let titleType: TitleType = "normal";
  if (titleElementClass.includes('trophy_Rainbow')) {
    titleType = "rainbow";
  } else if (titleElementClass.includes('trophy_Gold')) {
    titleType = "gold";
  } else if (titleElementClass.includes('trophy_Silver')) {
    titleType = "silver";
  } else if (titleElementClass.includes('trophy_Bronze')) {
    titleType = "bronze";
  } else if (titleElementClass.includes('trophy_Normal')) {
    titleType = "normal";
  }
  logger.debug(`Extracted trophy type: ${titleType}`);

  // Extract stars
  const starsElement = block.find('.p_l_10.f_l.f_14');
  if (starsElement.length === 0) {
    throw new Error("Could not find stars element in player data");
  }
  const starsText = starsElement.text().trim();
  // Format is ×999 or x999, extract just the number part
  const starsMatch = starsText.match(/[×x](\d+)/);
  if (!starsMatch) {
    throw new Error(`Invalid stars format: ${starsText}`);
  }
  const stars = parseInt(starsMatch[1], 10);
  logger.debug(`Extracted stars: ${stars} (from text: ${starsText})`);

  // Extract play counts
  const playCountElement = block.find('.t_r.f_12');
  if (playCountElement.length === 0) {
    throw new Error("Could not find play count element in player data");
  }
  const playCountText = playCountElement.text().trim();
  logger.debug(`Play count text: ${playCountText}`);

  const playCountRegex = region === "jp" ? /現バージョンプレイ回数[：:]\s*([\d,]+)/ : /play count of current version[：:]\s*([\d,]+)/;
  const totalPlayCountRegex = region === "jp" ? /累計プレイ回数[：:]\s*([\d,]+)/ : /maimaiDX total play count[：:]\s*([\d,]+)/;

  // Parse version play count: "play count of current version：195"
  const versionPlayCountMatch = playCountText.match(playCountRegex);
  if (!versionPlayCountMatch) {
    throw new Error(`Could not parse version play count from: ${playCountText}`);
  }
  const versionPlayCount = parseInt(versionPlayCountMatch[1].replace(/,/g, ''), 10);

  // Parse total play count: "maimaiDX total play count：909"
  const totalPlayCountMatch = playCountText.match(totalPlayCountRegex);
  if (!totalPlayCountMatch) {
    throw new Error(`Could not parse total play count from: ${playCountText}`);
  }
  const totalPlayCount = parseInt(totalPlayCountMatch[1].replace(/,/g, ''), 10);

  logger.debug(`Extracted version play count: ${versionPlayCount}`);
  logger.debug(`Extracted total play count: ${totalPlayCount}`);

  // Extract course rank and class rank images
  const rankElements = block.find('.h_35.f_l');
  if (rankElements.length < 2) {
    throw new Error(`Expected 2 rank elements, found ${rankElements.length}`);
  }

  // Course rank (first element) - the element itself is an img
  const courseRankSrc = rankElements.eq(0).attr('src');
  if (!courseRankSrc) {
    throw new Error("Course rank image src attribute is missing");
  }
  const courseRankUrl = courseRankSrc.startsWith('http') ? courseRankSrc : `https://maimaidx-eng.com${courseRankSrc}`;
  logger.debug(`Extracted course rank URL: ${courseRankUrl}`);

  // Class rank (second element) - the element itself is an img
  const classRankSrc = rankElements.eq(1).attr('src');
  if (!classRankSrc) {
    throw new Error("Class rank image src attribute is missing");
  }
  const classRankUrl = classRankSrc.startsWith('http') ? classRankSrc : `https://maimaidx-eng.com${classRankSrc}`;
  logger.debug(`Extracted class rank URL: ${classRankUrl}`);

  return {
    iconUrl,
    iconBase64: await fetchImageAsBase64(region, iconUrl, cookies),
    displayName,
    rating,
    title,
    titleType,
    stars,
    versionPlayCount,
    totalPlayCount,
    courseRankUrl,
    classRankUrl,
  };
}

async function fetchImageAsBase64(region: Region, imageUrl: string, cookies: string): Promise<string> {
  logger.info(`Fetching image for base64 encoding: ${imageUrl}`);

  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Cookie": cookies || "",
    },
    ...{ dispatcher: AGENT },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch icon image: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');

  // Get content type for data URL
  const contentType = response.headers.get('content-type') || 'image/png';
  const dataUrl = `data:${contentType};base64,${base64}`;

  logger.debug(`Image encoded as base64 (${base64.length} characters)`);
  return dataUrl;
}

async function createUserSnapshot(
  userId: string,
  region: Region,
  playerData: PlayerData,
): Promise<bigint> {
  const publicId = nanoid();

  logger.info(`Creating user snapshot with publicId: ${publicId}`);

  const [inserted] = await db.insert(userSnapshots).values({
    publicId: publicId,
    userId: userId,
    region: region,
    fetchedAt: new Date(),
    gameVersion: getCurrentVersion(region),
    rating: playerData.rating,
    courseRankUrl: playerData.courseRankUrl,
    classRankUrl: playerData.classRankUrl,
    stars: playerData.stars,
    versionPlayCount: playerData.versionPlayCount,
    totalPlayCount: playerData.totalPlayCount,
    iconUrl: playerData.iconBase64,
    displayName: playerData.displayName,
    title: playerData.title,
    titleType: playerData.titleType,
  }).returning({ id: userSnapshots.id });

  logger.info(`User snapshot created successfully with internal ID: ${inserted.id}`);
  return inserted.id;
}

/**
 * Builds song lookup maps for efficient song matching during insertion.
 * Queries all songs for the specified region and game version once.
 *
 * @returns Object containing:
 *   - songLookup: Map from "songName|difficulty|type" to songId
 *   - fullSongMap: Map from songId to full song data
 */
async function buildSongLookupMaps(
  region: Region,
  gameVersion: number
): Promise<{
  songLookup: Map<string, bigint>;
  fullSongMap: Map<bigint, typeof songs.$inferSelect>;
}> {
  logger.info(`Batch querying songs for region ${region}, game version ${gameVersion}`);
  const allSongs = await db.query.songs.findMany({
    where: and(
      eq(songs.region, region),
      eq(songs.gameVersion, gameVersion)
    ),
  });
  logger.info(`Found ${allSongs.length} songs in database for this region/version`);

  // Create lookup maps for efficient song matching
  const songLookup = new Map<string, bigint>(); // key: "songName|difficulty|type", value: songId
  const fullSongMap = new Map<bigint, typeof songs.$inferSelect>(); // key: songId, value: full song data

  for (const song of allSongs) {
    const key = `${song.songName}|${song.difficulty}|${song.type}`;
    songLookup.set(key, song.id);
    fullSongMap.set(song.id, song);
  }
  logger.info(`Created song lookup maps with ${songLookup.size} entries`);

  return { songLookup, fullSongMap };
}

/**
 * Adds rank field to user score inserts based on rating calculation.
 * Ranks are assigned as: 0-14 (new B15), 15-49 (old B35), 50+ (remaining)
 */
async function withRank(
  scoreInserts: typeof userScores.$inferInsert[],
  fullSongMap: Map<bigint, typeof songs.$inferSelect>,
  gameVersion: number
): Promise<typeof userScores.$inferInsert[]> {
  if (scoreInserts.length === 0) {
    return scoreInserts;
  }

  logger.debug(`Calculating ranks for ${scoreInserts.length} scores...`);

  // Convert score inserts to SongWithScore format for rating calculation
  const songsForRanking: (Omit<SongWithScore, 'songId'> & { songId: bigint })[] = [];
  for (const scoreInsert of scoreInserts) {
    const fullSong = fullSongMap.get(scoreInsert.songId);
    if (!fullSong) continue;

    songsForRanking.push({
      songId: fullSong.id,
      songName: fullSong.songName,
      artist: fullSong.artist,
      cover: fullSong.cover,
      difficulty: fullSong.difficulty,
      level: fullSong.level,
      levelPrecise: fullSong.levelPrecise,
      type: fullSong.type,
      genre: fullSong.genre,
      addedVersion: fullSong.addedVersion,
      achievement: scoreInsert.achievement,
      dxScore: scoreInsert.dxScore,
      fc: scoreInsert.fc,
      fs: scoreInsert.fs,
    });
  }

  // Calculate rankings using splitSongs
  const { newSongsB15, oldSongsB35, newSongsRemaining, oldSongsRemaining } = splitSongs(songsForRanking, gameVersion);

  // Create a map of songId+difficulty -> rank
  const rankMap = new Map<string, number>();

  // New B15: ranks 0-14
  for (let i = 0; i < newSongsB15.length; i++) {
    const song = newSongsB15[i];
    rankMap.set(`${song.songId}-${song.difficulty}`, i);
  }

  // Old B35: ranks 15-49
  for (let i = 0; i < oldSongsB35.length; i++) {
    const song = oldSongsB35[i];
    rankMap.set(`${song.songId}-${song.difficulty}`, 15 + i);
  }

  // Remaining: merge and sort by rating desc, start from rank 50
  const remainingSongs = [...newSongsRemaining, ...oldSongsRemaining].sort((a, b) => b.rating - a.rating);
  for (let i = 0; i < remainingSongs.length; i++) {
    const song = remainingSongs[i];
    rankMap.set(`${song.songId}-${song.difficulty}`, 50 + i);
  }

  // Assign ranks to score inserts
  for (const scoreInsert of scoreInserts) {
    const fullSong = fullSongMap.get(scoreInsert.songId);
    if (!fullSong) {
      throw new Error(`Full song data not found for songId: ${scoreInsert.songId}`);
    }

    const rank = rankMap.get(`${fullSong.id}-${fullSong.difficulty}`);
    if (rank === undefined) {
      throw new Error(`Rank not calculated for song: ${fullSong.songName} (${fullSong.difficulty})`);
    }

    scoreInsert.rank = rank;
  }

  logger.info(`Ranks calculated. B15: ${newSongsB15.length}, B35: ${oldSongsB35.length}, Remaining: ${remainingSongs.length}`);

  return scoreInserts;
}

async function insertUserScores(
  snapshotId: bigint,
  region: Region,
  sessionId: bigint,
  allScoreData: { [difficulty: number]: ScoreData[] },
  songLookup: Map<string, bigint>,
  fullSongMap: Map<bigint, typeof songs.$inferSelect>
): Promise<void> {
  const gameVersion = getCurrentVersion(region);

  logger.info(`Starting user scores insertion for snapshot ${snapshotId}`);

  // Flatten all score data from all difficulties
  const allScores: ScoreData[] = [];
  for (const difficulty of Object.keys(allScoreData)) {
    allScores.push(...allScoreData[parseInt(difficulty)]);
  }

  logger.info(`Total scores to insert: ${allScores.length}`);

  if (allScores.length === 0) {
    logger.warn("No scores to insert");
    return;
  }

  // Process all scores using the lookup map
  const scoreInserts: typeof userScores.$inferInsert[] = [];
  const notFoundScores: ScoreData[] = [];
  let foundCount = 0;
  let notFoundCount = 0;

  for (const scoreData of allScores) {
    try {
      const lookupKey = `${scoreData.songName}|${scoreData.difficulty}|${scoreData.musicType}`;
      const songId = songLookup.get(lookupKey);

      if (!songId) {
        logger.warn(`Could not find song in database: ${scoreData.songName} (${scoreData.difficulty}, ${scoreData.musicType})`);
        notFoundScores.push(scoreData);
        notFoundCount++;
        continue;
      }

      // Create user score record
      scoreInserts.push({
        snapshotId: snapshotId,
        songId: songId,
        achievement: scoreData.achievement,
        dxScore: scoreData.dxScore,
        fc: scoreData.fc,
        fs: scoreData.fs,
      });

      foundCount++;
    } catch (error) {
      logger.error(error, `Error processing score for ${scoreData.songName}`);
      notFoundCount++;
    }
  }

  logger.info(`Prepared ${foundCount} score inserts, ${notFoundCount} songs not found in database`);

  if (scoreInserts.length > 0) {
    logger.info(`Batch inserting ${scoreInserts.length} user scores`);
    await db.insert(userScores).values(await withRank(scoreInserts, fullSongMap, gameVersion));
    logger.info(`Successfully inserted ${scoreInserts.length} user scores`);
  } else {
    logger.warn("No valid scores to insert");
  }

  if (notFoundScores.length > 0) {
    logger.warn(`Found ${notFoundScores.length} scores not found in database:`);
    for (const score of notFoundScores) {
      logger.warn(` - ${score.songName} (${score.difficulty}, ${score.musicType})`);
    }
    await db
      .update(fetchSessions)
      .set({
        extraData: JSON.stringify({
          notFoundScores: notFoundScores.map(score => ({
            songName: score.songName,
            difficulty: score.difficulty,
            musicType: score.musicType,
          })),
        }),
      })
      .where(eq(fetchSessions.id, sessionId));
  }
}

async function insertUserRecentSongs(
  userId: string,
  recentSongsData: RecentSongData[],
  songLookup: Map<string, bigint>
): Promise<void> {
  logger.info(`Starting user recent songs insertion for user ${userId}, ${recentSongsData.length} records`);

  if (recentSongsData.length === 0) {
    logger.debug("No recent songs to insert");
    return;
  }

  // Process recent songs and create inserts
  const recentSongInserts: (typeof userRecentSongs.$inferInsert)[] = [];
  const notFoundSongs: RecentSongData[] = [];

  for (const recentSong of recentSongsData) {
    try {
      const lookupKey = `${recentSong.songName}|${recentSong.difficulty}|${recentSong.musicType}`;
      const songId = songLookup.get(lookupKey);

      if (!songId) {
        logger.warn(`Could not find song in database: ${recentSong.songName} (${recentSong.difficulty}, ${recentSong.musicType})`);
        notFoundSongs.push(recentSong);
        continue;
      }

      // Create recent song record
      recentSongInserts.push({
        userId: userId,
        songId: songId,
        playedAt: recentSong.playedAt,
        archievement: recentSong.achievement, // Note: typo in schema "archievement"
        dxScore: recentSong.dxScore,
        maxDxScore: recentSong.maxDxScore,
        fc: recentSong.fc,
        fs: recentSong.fs,
        track: recentSong.track,
      });
    } catch (error) {
      logger.error(error, `Error processing recent song: ${recentSong.songName}`);
    }
  }

  logger.debug(`Prepared ${recentSongInserts.length} recent song inserts, ${notFoundSongs.length} songs not found`);

  if (recentSongInserts.length === 0) {
    logger.warn("No valid recent songs to insert");
    return;
  }

  // Use ON CONFLICT DO NOTHING to handle duplicates efficiently at the database level
  // This leverages the unique constraint on (userId, songId, playedAt)
  await db
    .insert(userRecentSongs)
    .values(recentSongInserts)
    .onConflictDoNothing();

  logger.info(`Processed ${recentSongInserts.length} recent song records (duplicates automatically skipped)`);
}

async function fetchAndInsertRecentSongsData(
  userId: string,
  region: Region,
  cookies: string,
  recentSongsData: RecentSongData[]
): Promise<void> {
  logger.info(`Starting detailed recent songs data fetch for user ${userId}, ${recentSongsData.length} records`);

  if (recentSongsData.length === 0) {
    logger.debug("No recent songs to fetch details for");
    return;
  }

  const baseUrl = region === "jp" ? "https://maimaidx.jp" : "https://maimaidx-eng.com";
  const playlogDetailUrl = `${baseUrl}/maimai-mobile/record/playlogDetail/`;

  // Process in batches of 6
  const BATCH_SIZE = 6;
  for (let batchStart = 0; batchStart < recentSongsData.length; batchStart += BATCH_SIZE) {
    const batch = recentSongsData.slice(batchStart, batchStart + BATCH_SIZE);
    logger.debug(`Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: ${batch.length} records`);

    // Fetch detailed data for each song in the batch concurrently
    const detailPromises = batch.map(async (recentSong) => {
      try {
        // GET playlog detail page with idx query parameter
        const detailUrl = `${playlogDetailUrl}?idx=${encodeURIComponent(recentSong.idx)}`;

        const response = await fetch(detailUrl, {
          method: "GET",
          headers: {
            "Cookie": cookies,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Referer": `${baseUrl}/maimai-mobile/record/`,
          },
          ...{ dispatcher: AGENT },
        });

        if (response.status !== 200) {
          logger.warn(`Failed to fetch playlog detail for idx ${recentSong.idx}: HTTP ${response.status}`);
          return null;
        }

        const html = await response.text();
        const $ = load(html);

        // Parse fast and late counts
        const flBlocks = $(".playlog_fl_block > * .p_t_5");
        const fastCount = flBlocks.length > 0 ? parseInt(flBlocks.eq(0).text().trim().replace(/,/g, ''), 10) || 0 : 0;
        const lateCount = flBlocks.length > 1 ? parseInt(flBlocks.eq(1).text().trim().replace(/,/g, ''), 10) || 0 : 0;

        // Parse combo
        const scoreBlocks = $(".playlog_score_block > div.white");
        const comboText = scoreBlocks.length > 1 ? scoreBlocks.eq(1).text().trim() : "";
        const comboMatch = comboText.match(/(\d+(?:,\d+)?)\s*\/\s*(\d+(?:,\d+)?)/);
        const combo = comboMatch ? parseInt(comboMatch[1].replace(/,/g, ''), 10) : 0;
        const maxCombo = comboMatch ? parseInt(comboMatch[2].replace(/,/g, ''), 10) : 0;

        // Parse sync score (optional)
        const syncScoreText = scoreBlocks.length > 2 ? scoreBlocks.eq(2).text().trim() : "";
        let syncScore: number | null = null;
        let maxSyncScore: number | null = null;
        if (syncScoreText.includes('/')) {
          const syncMatch = syncScoreText.match(/(\d+(?:,\d+)?)\s*\/\s*(\d+(?:,\d+)?)/);
          if (syncMatch) {
            syncScore = parseInt(syncMatch[1].replace(/,/g, ''), 10);
            maxSyncScore = parseInt(syncMatch[2].replace(/,/g, ''), 10);
          }
        }

        // Parse rating
        const ratingText = $(".rating_block").text().trim();
        const rating = parseInt(ratingText, 10) || 0;

        // Parse rating change
        const ratingChangeText = $(".playlog_rating_detail_block > * span").text().trim();
        const ratingChangeMatch = ratingChangeText.match(/([+-])(\d+)/);
        const ratingChange = ratingChangeMatch ? parseInt(`${ratingChangeMatch[1]}${ratingChangeMatch[2]}`, 10) : 0;

        // Parse venue (JP only, optional)
        let venue: string | null = null;
        if (region === "jp") {
          const venueElement = $("#placeName");
          if (venueElement.length > 0) {
            venue = venueElement.text().trim() || null;
          }
        }

        // Parse note details (tap, hold, slide, touch, break)
        const noteRows = $(".playlog_notes_detail > * tr:not(:first-child)");
        const noteTypes = ['tap', 'hold', 'slide', 'touch', 'break'];
        const noteData: { [key: string]: { [key: string]: number } } = {};

        noteRows.each((index, row) => {
          if (index >= 5) return; // Only process first 5 rows

          const cells = $(row).find("td");
          const noteType = noteTypes[index];

          noteData[noteType] = {
            cperfect: cells.length > 0 ? parseInt(cells.eq(0).text().trim(), 10) || 0 : 0,
            perfect: cells.length > 1 ? parseInt(cells.eq(1).text().trim(), 10) || 0 : 0,
            great: cells.length > 2 ? parseInt(cells.eq(2).text().trim(), 10) || 0 : 0,
            good: cells.length > 3 ? parseInt(cells.eq(3).text().trim(), 10) || 0 : 0,
            miss: cells.length > 4 ? parseInt(cells.eq(4).text().trim(), 10) || 0 : 0,
          };
        });

        return {
          recentSong,
          fastCount,
          lateCount,
          combo,
          maxCombo,
          syncScore,
          maxSyncScore,
          rating,
          ratingChange,
          venue,
          noteData,
        };
      } catch (error) {
        logger.error(error, `Error fetching playlog detail for idx ${recentSong.idx}`);
        return null;
      }
    });

    const detailResults = await Promise.all(detailPromises);

    // Query for the recentSongIds for this batch
    const validResults = detailResults.filter(r => r !== null);
    if (validResults.length === 0) {
      logger.warn(`No valid detail results in batch ${Math.floor(batchStart / BATCH_SIZE) + 1}`);
      continue;
    }

    // Query recent song IDs from database
    const recentSongRecords = await db.query.userRecentSongs.findMany({
      where: and(
        eq(userRecentSongs.userId, userId),
        or(
          ...validResults.map(r =>
            and(
              eq(userRecentSongs.playedAt, r!.recentSong.playedAt)
            )
          )
        )
      ),
      columns: {
        id: true,
        playedAt: true,
      }
    });

    // Create map of playedAt timestamp to recentSongId
    const recentSongIdMap = new Map<number, bigint>();
    for (const record of recentSongRecords) {
      recentSongIdMap.set(record.playedAt.getTime(), record.id);
    }

    // Prepare detailed inserts
    const detailedInserts: typeof userRecentSongsDetailed.$inferInsert[] = [];
    for (const result of validResults) {
      const recentSongId = recentSongIdMap.get(result.recentSong.playedAt.getTime());
      if (!recentSongId) {
        logger.warn(`Could not find recentSongId for playedAt ${result.recentSong.playedAt.toISOString()}`);
        continue;
      }

      detailedInserts.push({
        recentSongId,
        fastCount: result.fastCount,
        lateCount: result.lateCount,
        combo: result.combo,
        maxCombo: result.maxCombo,
        syncScore: result.syncScore,
        maxSyncScore: result.maxSyncScore,
        tapCPerfect: result.noteData.tap?.cperfect || 0,
        tapPerfect: result.noteData.tap?.perfect || 0,
        tapGreat: result.noteData.tap?.great || 0,
        tapGood: result.noteData.tap?.good || 0,
        tapMiss: result.noteData.tap?.miss || 0,
        holdCPerfect: result.noteData.hold?.cperfect || 0,
        holdPerfect: result.noteData.hold?.perfect || 0,
        holdGreat: result.noteData.hold?.great || 0,
        holdGood: result.noteData.hold?.good || 0,
        holdMiss: result.noteData.hold?.miss || 0,
        slideCPerfect: result.noteData.slide?.cperfect || 0,
        slidePerfect: result.noteData.slide?.perfect || 0,
        slideGreat: result.noteData.slide?.great || 0,
        slideGood: result.noteData.slide?.good || 0,
        slideMiss: result.noteData.slide?.miss || 0,
        touchCPerfect: result.noteData.touch?.cperfect || 0,
        touchPerfect: result.noteData.touch?.perfect || 0,
        touchGreat: result.noteData.touch?.great || 0,
        touchGood: result.noteData.touch?.good || 0,
        touchMiss: result.noteData.touch?.miss || 0,
        breakCPerfect: result.noteData.break?.cperfect || 0,
        breakPerfect: result.noteData.break?.perfect || 0,
        breakGreat: result.noteData.break?.great || 0,
        breakGood: result.noteData.break?.good || 0,
        breakMiss: result.noteData.break?.miss || 0,
        venue: result.venue,
        rating: result.rating,
        ratingChange: result.ratingChange,
      });
    }

    // Insert detailed data with conflict handling
    if (detailedInserts.length > 0) {
      await db
        .insert(userRecentSongsDetailed)
        .values(detailedInserts)
        .onConflictDoNothing();

      logger.debug(`Inserted ${detailedInserts.length} detailed records for batch ${Math.floor(batchStart / BATCH_SIZE) + 1}`);
    }
  }

  logger.info(`Completed detailed recent songs data fetch for user ${userId}`);
}

const MAX_STORAGE_BYTES = 25 * 1024 * 1024; // 25 MB

async function enforceStorageLimit(userId: string): Promise<void> {
  const userAlbumsList = await db.query.userAlbums.findMany({
    where: eq(userAlbums.userId, userId),
    orderBy: [userAlbums.createdAt],
    columns: { id: true, imageKey: true, imageSize: true },
  });

  let totalSize = userAlbumsList.reduce((sum, a) => sum + a.imageSize, 0);

  if (totalSize <= MAX_STORAGE_BYTES) {
    logger.debug(`User ${userId} storage: ${totalSize} bytes (within 25MB limit)`);
    return;
  }

  logger.info(`User ${userId} storage: ${totalSize} bytes (exceeds 25MB limit), cleaning up...`);

  for (const album of userAlbumsList) {
    if (totalSize <= MAX_STORAGE_BYTES) {
      break;
    }

    try {
      await deleteFromR2(album.imageKey);
      logger.debug(`Deleted R2 object: ${album.imageKey}`);
    } catch (error) {
      logger.error(error, `Failed to delete R2 object: ${album.imageKey}`);
    }

    await db.delete(userAlbums).where(eq(userAlbums.id, album.id));
    totalSize -= album.imageSize;
    logger.info(`Deleted album ${album.id}, freed ${album.imageSize} bytes`);
  }

  logger.info(`User ${userId} storage cleanup complete: ${totalSize} bytes remaining`);
}

async function fetchAndInsertAlbumData(
  userId: string,
  region: Region,
  cookies: string,
  albumData: AlbumData[]
): Promise<void> {
  if (albumData.length === 0) {
    logger.debug("No album data to process");
    return;
  }

  logger.info(`Processing ${albumData.length} albums for user ${userId}`);

  const existingAlbums = await db.query.userAlbums.findMany({
    where: eq(userAlbums.userId, userId),
    columns: { takenAt: true },
  });

  const existingTakenAt = new Set(existingAlbums.map(a => a.takenAt.getTime()));

  const gameVersion = getCurrentVersion(region);
  const { songLookup } = await buildSongLookupMaps(region, gameVersion);

  const albumInserts: typeof userAlbums.$inferInsert[] = [];
  const albumsToUpload: Array<AlbumData & { songId: bigint }> = [];

  for (const album of albumData) {
    if (existingTakenAt.has(album.takenAt.getTime())) {
      logger.debug(`Skipping duplicate album: ${album.songName} at ${album.takenAt.toISOString()}`);
      continue;
    }

    const lookupKey = `${album.songName}|${album.difficulty}|${album.musicType}`;
    const songId = songLookup.get(lookupKey);

    if (!songId) {
      logger.warn(`Could not find song: ${album.songName} (${album.difficulty}, ${album.musicType})`);
      continue;
    }

    albumsToUpload.push({ ...album, songId });
  }

  logger.info(`${albumsToUpload.length} new albums to upload`);

  for (const album of albumsToUpload) {
    try {
      const jpegBuffer = await fetchImageBuffer(album.imageUrl, cookies);
      const avifBuffer = await convertJpegToAvif(jpegBuffer, 80);
      const { key, size } = await uploadToR2(avifBuffer, "image/avif");

      albumInserts.push({
        userId,
        songId: album.songId,
        takenAt: album.takenAt,
        venue: album.venue,
        imageKey: key,
        imageSize: size,
      });

      logger.debug(`Uploaded album: ${album.songName} -> ${key}`);
    } catch (error) {
      logger.error(error, `Failed to process album: ${album.songName}`);
    }
  }

  if (albumInserts.length > 0) {
    await db.insert(userAlbums).values(albumInserts);
    logger.info(`Inserted ${albumInserts.length} album records`);
  }

  await enforceStorageLimit(userId);
}

async function fetchAlbumData(cookies: string, region: Region): Promise<AlbumData[]> {
  const baseUrl = region === "jp" ? "https://maimaidx.jp" : "https://maimaidx-eng.com";
  const albumUrl = `${baseUrl}/maimai-mobile/playerData/photo/`;
  logger.info(`Fetching album data from: ${albumUrl}`);

  const albumResponse = await fetch(albumUrl, {
    method: "GET",
    headers: {
      "Cookie": cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Referer": `${baseUrl}/maimai-mobile/`,
    },
    ...{ dispatcher: AGENT },
  });

  logger.debug(`Album data response status: ${albumResponse.status}`);

  if (albumResponse.status !== 200) {
    throw new Error(`Failed to fetch album data: HTTP ${albumResponse.status}`);
  }

  const albumHtml = await albumResponse.text();
  logger.debug(`Album data fetched successfully, length: ${albumHtml.length} characters`);

  const $ = load(albumHtml);
  const albums: AlbumData[] = [];

  const blocks = $(".m_10.p_5.f_0");
  logger.debug(`Found ${blocks.length} album blocks`);

  blocks.each((index, element) => {
    try {
      const block = $(element);

      const songNameBlock = block.find(".black_block");
      if (songNameBlock.length === 0) {
        logger.warn(`No song name block found for album ${index}`);
        return;
      }
      const songName = normalizeName(songNameBlock.text().trim());
      if (!songName) {
        logger.warn(`Could not extract song name for album ${index}`);
        return;
      }

      const musicKindIcon = block.find(".music_kind_icon");
      let musicType: SongType = "std";
      if (musicKindIcon.length > 0) {
        const iconSrc = musicKindIcon.attr("src") || "";
        if (iconSrc.includes("music_dx.png")) {
          musicType = "dx";
        } else if (iconSrc.includes("music_standard.png")) {
          musicType = "std";
        }
      }

      const diffElement = block.find(".p_r");
      const diffClassName = diffElement.attr("class") || "";
      let difficulty: "basic" | "advanced" | "expert" | "master" | "remaster" = "basic";

      if (diffClassName.includes("remaster")) {
        difficulty = "remaster";
      } else if (diffClassName.includes("master")) {
        difficulty = "master";
      } else if (diffClassName.includes("expert")) {
        difficulty = "expert";
      } else if (diffClassName.includes("advanced")) {
        difficulty = "advanced";
      } else if (diffClassName.includes("basic")) {
        difficulty = "basic";
      }

      const blockInfo = block.find(".block_info");
      const takenAtText = blockInfo.text().trim();
      const takenAtMatch = takenAtText.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
      if (!takenAtMatch) {
        logger.warn(`Could not parse takenAt from: ${takenAtText} for album ${index}`);
        return;
      }
      const [, year, month, day, hour, minute] = takenAtMatch;
      const takenAt = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);

      const imageElement = block.find("img.w_430");
      let imageUrl = "";
      if (imageElement.length > 0) {
        const imageSrc = imageElement.attr("src");
        if (imageSrc) {
          imageUrl = imageSrc.startsWith("http") ? imageSrc : `${baseUrl}${imageSrc}`;
        }
      }
      if (!imageUrl) {
        logger.warn(`Could not extract image URL for album ${index}`);
        return;
      }

      const venueBlock = block.find(".see_through_block");
      const venue = venueBlock.length > 0 ? venueBlock.text().trim() || null : null;

      albums.push({
        songName,
        musicType,
        difficulty,
        takenAt,
        imageUrl,
        venue,
      });

      logger.debug(`Extracted album ${index}: ${songName} (${difficulty}, ${musicType}) at ${takenAt.toISOString()}`);
    } catch (error) {
      logger.error(error, `Error processing album block ${index}`);
    }
  });

  logger.info(`Successfully extracted ${albums.length} albums`);
  return albums;
}

async function insertUserEvents(
  snapshotId: bigint,
  areaEvents: EventData[],
  eventAreaEvents: EventAreaData[]
): Promise<void> {
  logger.info(`Starting user events insertion for snapshot ${snapshotId}`);

  const eventInserts: typeof userEvents.$inferInsert[] = [];

  // Add area events
  for (const event of areaEvents) {
    eventInserts.push({
      snapshotId: snapshotId,
      eventType: "area",
      name: event.name,
      currentDistance: event.currentDistance,
      nextRewardDistance: event.nextRewardDistance,
      state: event.state,
      imageUrl: event.imageUrl,
      eventPeriodStart: null,
      eventPeriodEnd: null,
    });
  }

  // Add event area events
  for (const event of eventAreaEvents) {
    eventInserts.push({
      snapshotId: snapshotId,
      eventType: "eventArea",
      name: event.name,
      currentDistance: event.currentDistance,
      nextRewardDistance: event.nextRewardDistance,
      state: event.state,
      imageUrl: event.imageUrl,
      eventPeriodStart: event.eventPeriod ? new Date(event.eventPeriod[0]) : null,
      eventPeriodEnd: event.eventPeriod ? new Date(event.eventPeriod[1]) : null,
    });
  }

  logger.info(`Total events to insert: ${eventInserts.length}`);

  if (eventInserts.length === 0) {
    logger.warn("No events to insert");
    return;
  }

  // Batch insert all events
  logger.info(`Batch inserting ${eventInserts.length} user events`);
  await db.insert(userEvents).values(eventInserts);
  logger.info(`Successfully inserted ${eventInserts.length} user events`);
}

export async function fetchMaimaiData(
  userId: string,
  region: Region,
  sessionId: bigint,
  flags: string[] = [],
  shouldFetchAlbums: boolean = false
): Promise<void> {
  // Get the user's token from database
  const tokenRecord = await db.query.userTokens.findFirst({
    where: and(
      eq(userTokens.userId, userId),
      eq(userTokens.region, region)
    ),
  });

  if (!tokenRecord) {
    throw new Error("No token found for this region. Please add your maimai token first.");
  }

  // Check current time, if it is within 4AM - 7AM in JST, throw an error
  const now = new Date();
  const jstHour = (now.getUTCHours() + 9) % 24;
  if (jstHour >= 4 && jstHour < 7) {
    throw new Error("Cannot fetch data during maintenance window (4AM - 7AM JST)");
  }

  // Validate the token first
  const validation = await processMaimaiToken(userId, region, decryptToken(tokenRecord.token));

  if (!validation.isValid) {
    throw new Error(validation.error || "Token validation failed");
  }

  logger.info("Token validation passed, proceeding with data fetch...");

  if (!validation.redirectUrl) {
    throw new Error("No redirect URL received from token validation");
  }

  try {
    // Mark login state as completed (after token validation)
    appendFetchState(sessionId, FETCH_STATES.LOGIN); // Fire and forget

    // Fetch player data HTML using login flow
    const { html: playerDataHtml, cookies } = await fetchPlayerDataWithLogin(region, validation.redirectUrl, validation.cookies || null);

    // Extract player data and fetch songs data concurrently
    logger.info("Starting player data extraction and songs data fetch...");
    const [playerData, allSongsData, recentSongsData, albumData] = await Promise.all([
      // Extract player data from HTML and track progress
      extractPlayerData(region, playerDataHtml, cookies).then((data) => {
        appendFetchState(sessionId, FETCH_STATES.PLAYER_DATA); // Fire and forget
        return data;
      }),
      // Fetch all songs data using the same cookies
      fetchAllSongsData(cookies, region, sessionId),
      // Fetch recent songs data
      fetchRecentSongsData(cookies, region, sessionId).then((data) => {
        appendFetchState(sessionId, FETCH_STATES.RECENT_SONGS); // Fire and forget
        return data;
      }),
      // Fetch album data
      fetchAlbumData(cookies, region).then((data) => {
        appendFetchState(sessionId, FETCH_STATES.ALBUM_DATA); // Fire and forget
        return data;
      })
    ]);
    logger.info("Player data extraction and songs data fetch completed");

    // Fetch hidden songs data for intl region only
    try {
      if (region === "intl") {
        try {
          logger.info("Fetching hidden songs data for intl region...");
          const hiddenSongs = await fetchHiddenSongsData(cookies, allSongsData);

          // Add hidden songs to allSongsData
          for (const hiddenSong of hiddenSongs) {
            const difficulty = hiddenSong.difficultyNumber;
            if (!allSongsData[difficulty]) {
              allSongsData[difficulty] = [];
            }
            allSongsData[difficulty].push(hiddenSong);
          }

          logger.info(`Added ${hiddenSongs.length} hidden songs to songs data`);
        } catch (error) {
          logger.error(error, "Failed to fetch hidden songs data, continuing without hidden songs");
          // Don't throw error - continue without hidden songs
        }
      }
    } finally {
      appendFetchState(sessionId, FETCH_STATES.HIDDEN_SONGS); // Fire and forget
    }

    // Fetch events data
    let eventsData: Awaited<ReturnType<typeof fetchEventsData>> | null = null;

    if (flags.includes("eventsCard")) {
      try {
        logger.info("Fetching events data...");
        eventsData = await fetchEventsData(cookies, region, sessionId);
        logger.info("Events data fetched successfully");
      } catch (error) {
        logger.error(error, "Failed to fetch events data, continuing without events");
        // Don't throw error - continue without events
      }
    }

    // Create user snapshot with real player data
    const snapshotId = await createUserSnapshot(userId, region, playerData);

    // Build song lookup maps once for this region and game version
    const gameVersion = getCurrentVersion(region);
    const { songLookup, fullSongMap } = await buildSongLookupMaps(region, gameVersion);

    // Insert user scores into database
    logger.info("Starting user scores insertion...");
    await insertUserScores(snapshotId, region, sessionId, allSongsData, songLookup, fullSongMap);
    logger.info("User scores insertion completed");

    // Insert user recent songs into database
    if (recentSongsData.length > 0) {
      logger.info("Starting user recent songs insertion...");
      await insertUserRecentSongs(userId, recentSongsData, songLookup);
      logger.info("User recent songs insertion completed");
    }

    // Insert user events into database if we have events
    if (eventsData) {
      logger.info("Starting user events insertion...");
      await insertUserEvents(snapshotId, eventsData.areaEvents, eventsData.eventAreaEvents);
      logger.info("User events insertion completed");
    }

    logger.info("Player data processed and snapshot created successfully");
    logger.info(`Session ID: ${sessionId}`);

    // Fire and forget: Fetch detailed recent songs data in background
    if (recentSongsData.length > 0) {
      logger.info("Starting detailed recent songs data fetch in background...");
      fetchAndInsertRecentSongsData(userId, region, cookies, recentSongsData).catch((error) => {
        logger.error(error, "Failed to fetch detailed recent songs data");
      });
    }

    // Fire and forget: Fetch album data in background (only if user opted in)
    if (shouldFetchAlbums && albumData.length > 0) {
      logger.info("Starting album data fetch in background...");
      fetchAndInsertAlbumData(userId, region, cookies, albumData).catch((error) => {
        logger.error(error, "Failed to fetch album data");
      });
    } else if (!shouldFetchAlbums && albumData.length > 0) {
      logger.info(`Skipping album fetch: user opted out (found ${albumData.length} albums)`);
    }

  } catch (error) {
    logger.error(error, "Error during maimai data fetch");
    throw error;
  }
}
