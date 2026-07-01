import { NextRequest, NextResponse } from "next/server";
import { verifyCnProxyToken } from "@/lib/cn-proxy-token";
import { deleteToken, formatCnCookiesToken, saveCnCookiesToken } from "@/server/services/maimai-login";
import { startFetchServer } from "@/lib/maimai-server-actions";
import { AGENT } from "@/lib/http-agent";
import { requestLogger } from "@/lib/request-logger";

export const dynamic = "force-dynamic";

const CN_BASE = "https://maimai.wahlap.com";

async function fetchPlayerHtml(maimaiToken: string): Promise<{ html: string; cookies: string }> {
  // Step 1: hit the entry URL with ?t=<maimaiToken> to get the session cookies.
  const entryUrl = `${CN_BASE}/maimai-mobile/?t=${encodeURIComponent(maimaiToken)}`;
  const entryRes = await fetch(entryUrl, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 12; MicroMessenger/8.0)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "manual",
    ...{ dispatcher: AGENT },
  });

  const setCookies =
    typeof entryRes.headers.getSetCookie === "function"
      ? entryRes.headers.getSetCookie()
      : (entryRes.headers.get("set-cookie") ? [entryRes.headers.get("set-cookie")!] : []);

  if (setCookies.length === 0) {
    throw new Error(`no cookies set on entry (status=${entryRes.status})`);
  }
  const cookies = setCookies.map((c) => c.split(";")[0]).join("; ");

  // Step 2: fetch playerData with the captured cookies + referer.
  const playerRes = await fetch(`${CN_BASE}/maimai-mobile/playerData/`, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 12; MicroMessenger/8.0)",
      "Cookie": cookies,
      "Referer": `${CN_BASE}/maimai-mobile/`,
    },
    redirect: "manual",
    ...{ dispatcher: AGENT },
  });
  const html = await playerRes.text();
  if (playerRes.status !== 200) {
    throw new Error(`playerData status=${playerRes.status}`);
  }
  return { html, cookies };
}

function extractPlayerNameQuick(html: string): string | undefined {
  const m = html.match(/class="name_block[^"]*"[^>]*>([^<]+)</);
  return m ? m[1].trim() : undefined;
}

interface WebhookPayload {
  token?: string;
  maimaiToken?: string;
  maimaiLoginUrl?: string;
  callbackUrl?: string;
  r?: string;
  state?: string;
  code?: string;
  t?: string;
}

export async function POST(req: NextRequest) {
  const { log } = requestLogger(req, "cn-proxy/callback");
  let body: WebhookPayload;
  try {
    body = (await req.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  if (!body.token) {
    return NextResponse.json({ ok: false, error: "missing token" }, { status: 400 });
  }
  if (!body.maimaiToken) {
    return NextResponse.json({ ok: false, error: "missing maimaiToken" }, { status: 400 });
  }

  let userId: string;
  try {
    ({ userId } = verifyCnProxyToken(body.token));
  } catch (err) {
    log.warn({ err }, "webhook rejected — bad token");
    return NextResponse.json({ ok: false, error: "invalid token" }, { status: 401 });
  }

  if (process.env.DEBUG_CN_FETCH) {
    const debugUrl = `${CN_BASE}/maimai-mobile/?t=${encodeURIComponent(body.maimaiToken)}`;
    log.info({ url: debugUrl }, "DEBUG_CN_FETCH — open in your browser to capture cookies manually");
    return NextResponse.json({ ok: true, debug: true, url: debugUrl });
  }

  // Use the single-use t= token to obtain the longer-lived maimai-mobile
  // session cookies, then verify by hitting playerData. If everything works
  // we save the cookies as a `cn-cookies://` token and immediately kick off
  // a fetch session — the dashboard's existing session-polling will see the
  // new session and close the dialog.
  try {
    const { html, cookies } = await fetchPlayerHtml(body.maimaiToken);
    if (html.includes("登录失败")) {
      throw new Error("session error in playerData html");
    } else if (html.includes("错误码")) {
      throw new Error("error in html");
    }
    const playerName = extractPlayerNameQuick(html);
    await saveCnCookiesToken(userId, formatCnCookiesToken(cookies));
    log.info({ userId, r: body.r, size: html.length, playerName: playerName ?? "?" }, "cookies saved");
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.warn({ userId, r: body.r, err }, "verification failed");
    await deleteToken(userId, "cn").catch(() => {});
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }

  // Kick off the fetch on the user's behalf. The dashboard's session
  // polling will pick up the new session id and close the dialog.
  try {
    const result = await startFetchServer(userId, "cn");
    log.info({ userId, session: result.sessionId }, "started fetch session");
    return NextResponse.json({ ok: true, sessionId: result.sessionId });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error({ userId, err }, "startFetch failed");
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
