import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveBaseUrl } from "@/lib/base-url";
import { requireOAuthClient, resolveTomomaiApiBase } from "@/lib/env";
import { buildRedirectUri, exchangeAuthorizationCode, TokenEndpointError } from "@/lib/oauth";
import {
  OAUTH_STATE_COOKIE,
  PKCE_VERIFIER_COOKIE,
  SESSION_COOKIE,
  sealSession,
  sessionCookieOptions,
  transientOAuthCookieOptions,
} from "@/lib/session";

function redirectHome(baseUrl: string, error?: string): NextResponse {
  const url = new URL("/", baseUrl);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const baseUrl = resolveBaseUrl();
  const apiBase = resolveTomomaiApiBase();
  const params = request.nextUrl.searchParams;

  if (params.get("error")) return redirectHome(baseUrl, "oauth_denied");

  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!expectedState || params.get("state") !== expectedState) {
    return redirectHome(baseUrl, "state_mismatch");
  }

  const issuer = params.get("iss");
  if (issuer && issuer !== `${apiBase}/api/auth`) {
    return redirectHome(baseUrl, "issuer_mismatch");
  }

  const code = params.get("code");
  const codeVerifier = request.cookies.get(PKCE_VERIFIER_COOKIE)?.value;
  if (!code || !codeVerifier) return redirectHome(baseUrl, "invalid_callback");

  let clientId: string;
  let clientSecret: string;
  try {
    ({ clientId, clientSecret } = requireOAuthClient());
  } catch {
    return redirectHome(baseUrl, "takeout_oauth_not_configured");
  }

  try {
    const token = await exchangeAuthorizationCode({
      apiBase,
      clientId,
      clientSecret,
      code,
      codeVerifier,
      redirectUri: buildRedirectUri(baseUrl),
    });
    const response = redirectHome(baseUrl);

    response.cookies.set(
      SESSION_COOKIE,
      await sealSession({
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt: Date.now() + token.expires_in * 1000,
        scope: token.scope,
      }),
      sessionCookieOptions(baseUrl),
    );
    const transientOptions = transientOAuthCookieOptions(baseUrl);
    response.cookies.set(OAUTH_STATE_COOKIE, "", { ...transientOptions, maxAge: 0 });
    response.cookies.set(PKCE_VERIFIER_COOKIE, "", { ...transientOptions, maxAge: 0 });
    return response;
  } catch (error) {
    if (error instanceof TokenEndpointError) {
      return redirectHome(baseUrl, "token_exchange_failed");
    }

    return redirectHome(baseUrl, "token_exchange_failed");
  }
}
