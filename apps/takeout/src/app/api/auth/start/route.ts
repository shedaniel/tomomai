import { NextResponse } from "next/server";
import { resolveBaseUrl } from "@/lib/base-url";
import { requireOAuthClient, resolveTomomaiApiBase } from "@/lib/env";
import { buildAuthorizeUrl, buildRedirectUri } from "@/lib/oauth";
import { pkceChallenge, randomState, randomVerifier } from "@/lib/pkce";
import {
  OAUTH_STATE_COOKIE,
  PKCE_VERIFIER_COOKIE,
  transientOAuthCookieOptions,
} from "@/lib/session";

export async function GET(): Promise<NextResponse> {
  const baseUrl = resolveBaseUrl();
  const apiBase = resolveTomomaiApiBase();
  let clientId: string;

  try {
    ({ clientId } = requireOAuthClient());
  } catch {
    return NextResponse.json({ error: "takeout_oauth_not_configured" }, { status: 503 });
  }

  const state = randomState();
  const verifier = randomVerifier();
  const redirectUri = buildRedirectUri(baseUrl);
  const response = NextResponse.redirect(
    buildAuthorizeUrl({
      apiBase,
      clientId,
      redirectUri,
      state,
      codeChallenge: await pkceChallenge(verifier),
    }),
  );

  const cookieOptions = transientOAuthCookieOptions(baseUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(PKCE_VERIFIER_COOKIE, verifier, cookieOptions);
  return response;
}
