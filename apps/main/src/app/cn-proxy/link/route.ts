import { NextRequest, NextResponse } from "next/server";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { verifyCnProxyToken } from "@/server/services/games/maimai/cn-proxy-token";
import { resolveBaseUrl } from "@/lib/base-url";
import { requestLogger } from "@/lib/request-logger";
import { requireFrontendGame } from "@/lib/games/current";

export const dynamic = "force-dynamic";

const ERROR_REDIRECT = `${resolveBaseUrl()}/cn-proxy/result?type=error`;

const { CN_PROXY_HOST, CN_PROXY_PORT } = process.env;
const proxyAgent =
  CN_PROXY_HOST && CN_PROXY_PORT
    ? new ProxyAgent(`http://${CN_PROXY_HOST}:${CN_PROXY_PORT}`)
    : undefined;

export async function GET(req: NextRequest) {
  requireFrontendGame("maimai");
  const { log } = requestLogger(req, "cn-proxy/link");
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(ERROR_REDIRECT, 302);
  }

  if (!verifyCnProxyToken(token)) {
    log.warn("Invalid or expired CN proxy link token");
    return NextResponse.redirect(ERROR_REDIRECT, 302);
  }

  let location: string | null = null;
  try {
    const res = await undiciFetch(
      "https://tgk-wcaime.wahlap.com/wc_auth/oauth/authorize/maimai-dx",
      { redirect: "manual", dispatcher: proxyAgent },
    );
    location = res.headers.get("location");
  } catch (err) {
    log.error({ err }, "Wahlap authorize request failed");
    return NextResponse.redirect(ERROR_REDIRECT, 302);
  }

  if (!location) {
    return NextResponse.redirect(ERROR_REDIRECT, 302);
  }

  // Downgrade redirect_uri to http so the proxy can intercept the WeChat
  // callback in plaintext, and embed our signed token so the proxy webhook
  // can identify the user.
  const wechatUrl = new URL(location);
  const redirectUri = wechatUrl.searchParams.get("redirect_uri");
  if (!redirectUri) {
    return NextResponse.redirect(ERROR_REDIRECT, 302);
  }
  const callbackUrl = new URL(redirectUri.replace(/^https:\/\//, "http://"));
  callbackUrl.searchParams.set("token", token);
  wechatUrl.searchParams.set("redirect_uri", callbackUrl.toString());

  return NextResponse.redirect(wechatUrl.toString(), 302);
}
