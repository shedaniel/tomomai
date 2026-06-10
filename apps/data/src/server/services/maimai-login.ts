import { AGENT } from "@tomomai/server/http-agent";
import { Region } from "@tomomai/catalog/types";
import { logger } from "@/lib/logger";

// Extracted from apps/main's maimai-login service: only the code path
// loginAndGetCookies() needs. The data service has no users, so every
// userTokens persistence branch (save/update/delete) has been stripped.
// Behavior for cookie:// and account:// token formats is identical to main.

export interface TokenValidationResult {
  isValid: boolean;
  redirectUrl?: string;
  error?: string;
  cookies?: string;
  token?: string;
}

export async function processMaimaiToken(
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

    return await validateInternationalMaimaiToken(cookieValue);
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
      logger.info("Invalid account token format");
      return {
        isValid: false,
        error: "Invalid account token format. Expected account://USERNAME:://PASSWORD or account://COOKIE:://USERNAME:://PASSWORD",
      };
    }

    // Validate that we have all required parts
    if (!username || !password) {
      logger.info("Invalid account token format, missing username or password");
      return {
        isValid: false,
        error: "Invalid account token format. Username and password cannot be empty.",
      };
    }

    // If we have a cookie, try to validate it first
    if (cookieValue && region === "intl") {
      logger.info("Trying to validate existing cookie");
      const cookieResult = await validateInternationalMaimaiToken(cookieValue);

      if (cookieResult.isValid) {
        return cookieResult;
      }

      // Token validation failed - attempt automatic re-login
      logger.info("Token validation failed, attempting automatic re-login");
      return await performInternationalAccountLogin(username, password);
    }

    // Proceed with login flow
    return await performAccountLogin(region, username, password);
  }

  // Invalid token format (only cookie:// and account:// are supported here)
  logger.info("Invalid token format");
  return {
    isValid: false,
    error: "Invalid token format. Token must start with 'cookie://' or 'account://'",
  };
}

async function performAccountLogin(
  region: Region,
  username: string,
  password: string
): Promise<TokenValidationResult> {
  return region === "intl" ? await performInternationalAccountLogin(username, password) : await performJapanAccountLogin(username, password);
}

async function performJapanAccountLogin(
  username: string,
  password: string
): Promise<TokenValidationResult> {
  const maimaiMobileUrl = "https://maimaidx.jp/maimai-mobile/";
  const submitUrl = "https://maimaidx.jp/maimai-mobile/submit/";

  logger.info(`Attempting Japan account login with username ${username}`);

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
      ...{ dispatcher: AGENT },
    });

    logger.debug(`Japan account login response status: ${response.status}`);

    if (response.status === 302) {
      // Check redirect URL
      const redirectUrl = response.headers.get("Location");
      logger.debug(`Login redirect URL: ${redirectUrl}`);

      if (!redirectUrl) {
        // 302 without redirect URL means login failed
        logger.warn("Login failed: 302 response without redirect URL");
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
        return {
          isValid: false,
          error: "Login failed. Please check your username and password.",
        };
      }
    } else {
      // Login failed with non-302 status
      logger.warn(`Japan account login failed with status: ${response.status}`);
      return {
        isValid: false,
        error: "Login failed. Please check your username and password.",
      };
    }
  } catch (error) {
    logger.error(error, "Error during Japan account login");
    return {
      isValid: false,
      error: "Failed to login. Please try again later.",
    };
  }
}

async function performInternationalAccountLogin(
  username: string,
  password: string
): Promise<TokenValidationResult> {
  const loginPageUrl = "https://lng-tgk-aime-gw.am-all.net/common_auth/login?site_id=maimaidxex&redirect_url=https://maimaidx-eng.com/maimai-mobile/&back_url=https://maimai.sega.com/";
  const loginUrl = "https://lng-tgk-aime-gw.am-all.net/common_auth/login/sid";

  logger.info(`Attempting account login with username ${username}`);

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
      return {
        isValid: false,
        error: "Failed to obtain session cookies. Please try again later.",
      };
    }

    // Parse all cookies into a cookie bag
    const cookieBag = setCookieHeaders.map(header => {
      return header.split(';')[0];
    }).join('; ');

    logger.debug(`Collected ${setCookieHeaders.length} cookies from login page`);

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
        "Cookie": cookieBag,
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
          return {
            isValid: false,
            error: "maimai accepted your credentials but did not return a session cookie. This is usually a temporary upstream issue. Please try again in a few minutes.",
          };
        }
      } else {
        logger.warn("No Set-Cookie header in login response");
        return {
          isValid: false,
          error: "maimai accepted your credentials but did not return a session cookie. This is usually a temporary upstream issue. Please try again in a few minutes.",
        };
      }
    } else {
      // Login failed
      logger.warn(`Account login failed with status: ${response.status}`);
      return {
        isValid: false,
        error: "Login failed. Please check your username and password.",
      };
    }
  } catch (error) {
    logger.error(error, "Error during account login");
    return {
      isValid: false,
      error: "Failed to login. Please try again later.",
    };
  }
}

export async function validateInternationalMaimaiToken(
  token: string
): Promise<TokenValidationResult> {
  const loginUrl = "https://lng-tgk-aime-gw.am-all.net/common_auth/login?site_id=maimaidxex&redirect_url=https://maimaidx-eng.com/maimai-mobile/&back_url=https://maimai.sega.com/";

  // Validate and sanitize the token
  const sanitizedToken = token.trim();

  // Check if token contains only ASCII characters
  if (!/^[\x00-\x7F]*$/.test(sanitizedToken)) {
    logger.warn("Token contains non-ASCII characters");
    return {
      isValid: false,
      error: "Invalid token format. Please ensure you copied the clal cookie correctly (ASCII characters only).",
    };
  }

  // Check if token is not empty
  if (!sanitizedToken) {
    logger.warn("Empty token provided");
    return {
      isValid: false,
      error: "Token cannot be empty.",
    };
  }

  logger.debug(`Validating intl token (token length: ${sanitizedToken.length})`);

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

export async function getCookiesFromRedirect(region: Region, redirectUrl: string, redirectCookies: string | null): Promise<string> {
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

  logger.debug(`Parsed cookies for request`);
  return cookies;
}

export async function loginAndGetCookies(region: Region, maimaiToken: string): Promise<string> {
  const validation = await processMaimaiToken(region, maimaiToken);

  if (!validation.isValid) {
    throw new Error(validation.error || "Token validation failed");
  }

  if (!validation.redirectUrl) {
    throw new Error("No redirect URL received from token validation");
  }

  console.log("Token validation successful, proceeding with data scraping...");
  console.log("Getting cookies from redirect URL...");
  return await getCookiesFromRedirect(region, validation.redirectUrl, validation.cookies || null);
}
