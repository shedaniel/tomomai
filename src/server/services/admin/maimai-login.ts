import { AGENT, processMaimaiToken } from "@/lib/maimai-fetcher";
import { Region } from "@/lib/types";

export async function login(region: Region, maimaiToken: string) {
  const validation = await processMaimaiToken(null, region, maimaiToken);

  if (!validation.isValid) {
    throw new Error(validation.error || "Token validation failed");
  }

  if (!validation.redirectUrl) {
    throw new Error("No redirect URL received from token validation");
  }

  console.log("Token validation successful, proceeding with data scraping...");

  console.log("Getting cookies from redirect URL...");
  return await getCookiesFromRedirect(validation.redirectUrl, validation.cookies || null);
}

// Helper function to get cookies from redirect URL
async function getCookiesFromRedirect(redirectUrl: string, redirectCookies: string | null): Promise<string> {
  console.log(`Fetching redirect URL to get login cookies: ${redirectUrl}`);

  const loginResponse = await fetch(redirectUrl, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      ...(redirectCookies ? { "Cookie": redirectCookies } : {}),
    },
    redirect: "manual", // Don't follow redirects,
    ...{ dispatcher: AGENT },
  });

  console.log(`Login response status: ${loginResponse.status}`);

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

  console.log(`Received ${setCookieHeaders.length} cookies from login`);

  // Parse cookies into a single Cookie header value
  const cookies = setCookieHeaders.map(header => {
    // Extract just the name=value part (before first semicolon)
    const cookiePart = header.split(';')[0];
    return cookiePart;
  }).join('; ');

  console.log(`Parsed cookies for song data request`);
  return cookies;
}
