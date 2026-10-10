import { NextRequest, NextResponse } from "next/server";
import { verifyCnProxyToken } from "@/server/services/games/maimai/cn-proxy-token";
import { formatCnCookies } from "@/lib/games/token-format";
import { deleteToken } from "@/server/services/games/tokens";
import { startScoreFetch } from "@/server/services/games/fetch-sessions";
import { fetchStartRejection } from "@/server/services/games/fetch-errors";
import { siteRoot, siteUrl } from "@/lib/games/sites";
import { requestGameSite, responseCookies } from "@/server/services/games/sega/http";
import { requestLogger } from "@/lib/request-logger";
import { requireFrontendGame } from "@/lib/games/current";

export const dynamic = "force-dynamic";

const WECHAT_USER_AGENT = "Mozilla/5.0 (Linux; Android 12; MicroMessenger/8.0)";

function entryPath(maimaiToken: string): string {
  return `?t=${encodeURIComponent(maimaiToken)}`;
}

async function fetchPlayerHtml(maimaiToken: string): Promise<{ html: string; cookies: string }> {
  // Step 1: hit the entry URL with ?t=<maimaiToken> to get the session cookies.
  const entryRes = await requestGameSite("maimai", "cn", entryPath(maimaiToken), {
    headers: {
      "User-Agent": WECHAT_USER_AGENT,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  await entryRes.body?.cancel();

  const cookies = responseCookies(entryRes.headers);
  if (!cookies) {
    throw new Error(`no cookies set on entry (status=${entryRes.status})`);
  }

  // Step 2: fetch playerData with the captured cookies + referer.
  const playerRes = await requestGameSite("maimai", "cn", "playerData/", {
    headers: {
      "User-Agent": WECHAT_USER_AGENT,
      "Cookie": cookies,
      "Referer": siteRoot("maimai", "cn").href,
    },
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
  requireFrontendGame("maimai");
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

  const verified = verifyCnProxyToken(body.token);
  if (!verified) {
    log.warn("Webhook rejected an invalid or expired token");
    return NextResponse.json({ ok: false, error: "invalid token" }, { status: 401 });
  }
  const { userId } = verified;

  if (process.env.DEBUG_CN_FETCH) {
    const debugUrl = siteUrl("maimai", "cn", entryPath(body.maimaiToken)).href;
    log.info({ url: debugUrl }, "DEBUG_CN_FETCH — open in your browser to capture cookies manually");
    return NextResponse.json({ ok: true, debug: true, url: debugUrl });
  }

  // Use the single-use t= token to obtain the longer-lived maimai-mobile
  // session cookies, then verify by hitting playerData. If everything works
  // we start a fetch with the cookies as a freshly supplied `cn-cookies://`
  // token, which saves it. The dashboard's session polling sees the new
  // session and closes the dialog.
  let token: string;
  try {
    const { html, cookies } = await fetchPlayerHtml(body.maimaiToken);
    if (html.includes("登录失败")) {
      throw new Error("session error in playerData html");
    } else if (html.includes("错误码")) {
      throw new Error("error in html");
    }
    const playerName = extractPlayerNameQuick(html);
    token = formatCnCookies(cookies);
    log.info({ userId, r: body.r, size: html.length, playerName: playerName ?? "?" }, "cookies verified");
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.warn({ userId, r: body.r, err }, "verification failed");
    await deleteToken("maimai", userId, "cn").catch(() => {});
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }

  try {
    const result = await startScoreFetch({ userId, game: "maimai", region: "cn", token });
    log.info({ userId, sessionId: result.sessionId }, "started fetch session");
    return NextResponse.json({ ok: true, sessionId: result.sessionId });
  } catch (err) {
    const rejection = fetchStartRejection(err);
    if (rejection) {
      log.warn({ userId, err }, "fetch refused");
      return NextResponse.json({ ok: false, error: rejection.message, code: rejection.code }, rejection.init);
    }
    log.error({ userId, err }, "startFetch failed");
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
