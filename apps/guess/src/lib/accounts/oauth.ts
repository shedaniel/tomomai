import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { oauthClient, tomomaiAuthBase } from "./config";

export const OAUTH_SCOPE = "user:metadata:read";

export type PendingLogin = {
  state: string;
  verifier: string;
  returnTo: string;
  redirectUri: string;
};

export type TomomaiIdentity = { userId: string; username: string | null; image: string | null };

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  jwks ??= createRemoteJWKSet(new URL(`${tomomaiAuthBase()}/api/auth/jwks`));
  return jwks;
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Only https images are rendered, so a stored value can never be a script URL. */
function safeImage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(pending: PendingLogin): string {
  const client = oauthClient();
  if (!client) throw new Error("oauth client not configured");
  const url = new URL(`${tomomaiAuthBase()}/api/auth/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: client.clientId,
    redirect_uri: pending.redirectUri,
    scope: OAUTH_SCOPE,
    state: pending.state,
    code_challenge: pkceChallenge(pending.verifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

/** Only same-origin paths survive the round trip through tomomai. */
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}

/**
 * Exchanges the code and resolves who signed in. The access token is
 * requested as a JWT (`resource`) because it is the only place the provider
 * exposes a stable user id: `/api/v1/me` returns a nullable, mutable username.
 * The token is used once for `/api/v1/me` and never stored.
 */
export async function completeLogin(
  code: string,
  pending: PendingLogin,
): Promise<TomomaiIdentity> {
  const client = oauthClient();
  if (!client) throw new Error("oauth client not configured");
  const base = tomomaiAuthBase();

  const tokenRes = await fetch(`${base}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: pending.verifier,
      redirect_uri: pending.redirectUri,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      resource: base,
    }),
    cache: "no-store",
  });
  if (!tokenRes.ok) {
    throw new Error(`token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
  }
  const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string };
  if (!accessToken) throw new Error("token response missing access_token");

  const { payload } = await jwtVerify(accessToken, getJwks(), {
    issuer: `${base}/api/auth`,
    audience: base,
  });
  if (payload.azp !== client.clientId) throw new Error("token issued to another client");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("token missing sub");

  const meRes = await fetch(`${base}/api/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!meRes.ok) throw new Error(`/api/v1/me failed (${meRes.status})`);
  const me = (await meRes.json()) as { username?: string | null; image?: string | null };

  return { userId: payload.sub, username: me.username ?? null, image: safeImage(me.image) };
}
