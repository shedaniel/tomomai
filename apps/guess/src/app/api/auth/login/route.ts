import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@tomomai/security/rate-limit";
import { accountsEnabled, oauthRedirectUri } from "@/lib/accounts/config";
import { buildAuthorizeUrl, sanitizeReturnTo, type PendingLogin } from "@/lib/accounts/oauth";
import { OAUTH_COOKIE, oauthCookieOptions, randomToken } from "@/lib/accounts/session";
import { authLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, authLimiter);
  if (limited) return limited;

  const returnTo = sanitizeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  if (!accountsEnabled()) return NextResponse.redirect(new URL(returnTo, req.url));

  const pending: PendingLogin = {
    state: randomToken(),
    verifier: randomToken(48),
    returnTo,
    redirectUri: oauthRedirectUri(req.nextUrl.origin),
  };
  const res = NextResponse.redirect(buildAuthorizeUrl(pending));
  res.cookies.set(OAUTH_COOKIE, JSON.stringify(pending), oauthCookieOptions());
  return res;
}
