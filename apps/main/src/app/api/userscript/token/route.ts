import { NextRequest, NextResponse } from "next/server";
import { resolveBaseUrlFromHeaders } from "@/lib/base-url";
import { USERSCRIPT_ALLOWED_ORIGINS } from "@/lib/userscript/allowed-origins";
import { useUserscriptFetch } from "@/lib/flags";

// Exchanges an OAuth authorization code (issued via the userscript's PKCE
// flow) for tokens, injecting the confidential client's `client_secret`
// server-side so it never ships in the userscript bundle.
//
// The userscript holds the `code_verifier` locally and posts it here together
// with the `code` it received via window.postMessage from /userscript/callback.

const ALLOWED_ORIGINS = new Set<string>(USERSCRIPT_ALLOWED_ORIGINS);

function corsHeaders(origin: string | null): HeadersInit {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
  }
  return {};
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: NextRequest) {
  if (!(await useUserscriptFetch())) return new NextResponse("Not Found", { status: 404 });
  const origin = request.headers.get("origin");
  const cors = corsHeaders(origin);

  const clientId = process.env.USERSCRIPT_CLIENT_ID;
  const clientSecret = process.env.USERSCRIPT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 500, headers: cors }
    );
  }

  let body: {
    grant_type?: unknown;
    code?: unknown;
    code_verifier?: unknown;
    redirect_uri?: unknown;
    refresh_token?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "body must be JSON" },
      { status: 400, headers: cors }
    );
  }

  // Default to authorization_code for backward compat with older userscript
  // bundles that don't send grant_type explicitly.
  const grantType = typeof body.grant_type === "string" ? body.grant_type : "authorization_code";
  const base = resolveBaseUrlFromHeaders(request.headers);

  const upstreamBody = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    // RFC 8707. Better Auth's oauth-provider triggers JWT-signed access
    // tokens (via the JWT plugin) when a `resource` is present at the
    // token endpoint — see checkResource() in @better-auth/oauth-provider.
    resource: base,
  });

  if (grantType === "authorization_code") {
    const { code, code_verifier, redirect_uri } = body;
    if (
      typeof code !== "string" ||
      typeof code_verifier !== "string" ||
      typeof redirect_uri !== "string"
    ) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "code, code_verifier, redirect_uri are required" },
        { status: 400, headers: cors }
      );
    }
    upstreamBody.set("grant_type", "authorization_code");
    upstreamBody.set("code", code);
    upstreamBody.set("code_verifier", code_verifier);
    upstreamBody.set("redirect_uri", redirect_uri);
  } else if (grantType === "refresh_token") {
    const { refresh_token } = body;
    if (typeof refresh_token !== "string") {
      return NextResponse.json(
        { error: "invalid_request", error_description: "refresh_token is required" },
        { status: 400, headers: cors }
      );
    }
    upstreamBody.set("grant_type", "refresh_token");
    upstreamBody.set("refresh_token", refresh_token);
  } else {
    return NextResponse.json(
      { error: "unsupported_grant_type" },
      { status: 400, headers: cors }
    );
  }

  try {
    const tokenRes = await fetch(`${base}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: upstreamBody,
    });
    const json = (await tokenRes.json()) as Record<string, unknown>;
    return NextResponse.json(json, { status: tokenRes.status, headers: cors });
  } catch {
    return NextResponse.json(
      { error: "token_exchange_failed" },
      { status: 502, headers: cors }
    );
  }
}
