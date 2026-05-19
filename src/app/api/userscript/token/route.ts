import { NextRequest, NextResponse } from "next/server";
import { resolveBaseUrlFromHeaders } from "@/lib/base-url";

// Exchanges an OAuth authorization code (issued via the userscript's PKCE
// flow) for tokens, injecting the confidential client's `client_secret`
// server-side so it never ships in the userscript bundle.
//
// The userscript holds the `code_verifier` locally and posts it here together
// with the `code` it received via window.postMessage from /userscript/callback.

const ALLOWED_ORIGINS = new Set([
  "https://maimaidx.jp",
  "https://maimaidx-eng.com",
]);

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

  let body: { code?: unknown; code_verifier?: unknown; redirect_uri?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "body must be JSON" },
      { status: 400, headers: cors }
    );
  }

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

  const base = resolveBaseUrlFromHeaders(request.headers);
  try {
    const tokenRes = await fetch(`${base}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri,
        // RFC 8707. Better Auth's oauth-provider triggers JWT-signed access
        // tokens (via the JWT plugin) when a `resource` is present at the
        // token endpoint — see checkResource() in @better-auth/oauth-provider.
        // Without this the access token stays opaque, which our verifier
        // (protect.ts) rejects. We pin it to the API base URL, which is also
        // the default `validAudiences` entry on the server.
        resource: base,
      }),
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
