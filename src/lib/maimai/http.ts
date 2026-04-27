import { AGENT } from "../http-agent";
import { Region } from "../types";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

export function maimaiBaseUrl(region: Region): string {
  return region === "jp" ? "https://maimaidx.jp" : "https://maimaidx-eng.com";
}

// Authenticated GET against the maimai mobile site, mimicking the headers
// the real client sends. Does NOT check status — callers that want custom
// error-handling (e.g. logging the response body) use this directly.
export async function maimaiRequest(url: string, cookies: string, referer: string): Promise<Response> {
  return fetch(url, {
    method: "GET",
    headers: {
      "Cookie": cookies,
      "User-Agent": USER_AGENT,
      "Referer": referer,
    },
    ...{ dispatcher: AGENT },
  });
}

// Same as maimaiRequest but throws if status !== 200.
export async function maimaiGet(url: string, cookies: string, referer: string): Promise<Response> {
  const response = await maimaiRequest(url, cookies, referer);
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response;
}

// Same as maimaiGet but returns the response text directly.
export async function maimaiGetHtml(url: string, cookies: string, referer: string): Promise<string> {
  const response = await maimaiGet(url, cookies, referer);
  return response.text();
}
