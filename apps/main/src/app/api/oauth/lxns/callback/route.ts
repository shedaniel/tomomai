import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { resolveBaseUrlFromHeaders } from "@/lib/base-url";
import { exchangeLxnsCode, saveLxnsToken } from "@/server/services/maimai-login";
import { requestLogger } from "@/lib/request-logger";

const STATE_COOKIE = "lxns_oauth_state";

function html(body: { ok: boolean; error?: string }): NextResponse {
  const safe = JSON.stringify(body).replace(/</g, "\\u003c");
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>lxns OAuth</title></head><body style="font-family:system-ui;padding:2rem;color:#333"><p>${body.ok ? "授权成功，正在关闭窗口…" : `授权失败：${body.error ?? "未知错误"}`
    }</p><script>(function(){try{if(window.opener){window.opener.postMessage({source:'lxns-oauth',payload:${safe}},window.location.origin);}}catch(e){}setTimeout(function(){window.close();},${body.ok ? 200 : 2500});})();</script></body></html>`;
  return new NextResponse(page, {
    status: body.ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: NextRequest) {
  const { log } = requestLogger(req, "oauth/lxns/callback");
  const clientId = process.env.LXNS_CLIENT_ID;
  const clientSecret = process.env.LXNS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    log.warn("callback blocked: env vars not configured");
    return html({ ok: false, error: "lxns_oauth_not_configured" });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    log.warn({ oauthError }, "callback received error from authorize");
    return html({ ok: false, error: oauthError });
  }
  if (!code || !state) {
    log.warn("callback missing code or state");
    return html({ ok: false, error: "missing_code_or_state" });
  }

  const session = await getServerSession();
  if (!session?.user) {
    log.warn("callback blocked: no session");
    return html({ ok: false, error: "unauthorized" });
  }

  const stateCookie = req.cookies.get(STATE_COOKIE)?.value;
  if (!stateCookie) {
    log.warn({ userId: session.user.id }, "callback missing state cookie");
    return html({ ok: false, error: "missing_state_cookie" });
  }
  const sep = stateCookie.indexOf(":");
  const cookieUserId = sep === -1 ? "" : stateCookie.slice(0, sep);
  const cookieState = sep === -1 ? "" : stateCookie.slice(sep + 1);
  if (cookieUserId !== session.user.id || cookieState !== state) {
    log.warn(
      { userId: session.user.id, cookieUserId, stateMatch: cookieState === state },
      "callback state mismatch",
    );
    return html({ ok: false, error: "state_mismatch" });
  }

  log.debug({ userId: session.user.id }, "callback: state verified, exchanging code");

  const baseUrl = resolveBaseUrlFromHeaders(req.headers);
  const redirectUri =
    process.env.LXNS_REDIRECT_URI || `${baseUrl}/api/oauth/lxns/callback`;

  const result = await exchangeLxnsCode(code, redirectUri);
  if (!result.isValid || !result.token) {
    log.warn({ userId: session.user.id, error: result.error }, "lxns code exchange failed");
    const res = html({ ok: false, error: result.error ?? "exchange_failed" });
    res.cookies.delete(STATE_COOKIE);
    return res;
  }

  await saveLxnsToken(session.user.id, result.token);
  log.info({ userId: session.user.id }, "callback: token persisted");

  const res = html({ ok: true });
  res.cookies.delete(STATE_COOKIE);
  return res;
}
