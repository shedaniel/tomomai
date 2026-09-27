export const TAKEOUT_SCOPES = [
  "user:metadata:read",
  "user:settings:read",
  "snapshot:all:metadata:read",
  "snapshot:all:songs:read",
  "snapshot:all:events:read",
  "snapshot:all:icon:read",
  "recent:read",
  "recent:detailed:read",
  "stats:read",
  "album:read",
  "album:images:read",
] as const;

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

export class TokenEndpointError extends Error {
  constructor(readonly status: number) {
    super(`Token endpoint failed with status ${status}`);
  }
}

export function buildRedirectUri(baseUrl: string): string {
  return `${baseUrl}/api/auth/callback`;
}

export function buildAuthorizeUrl(input: {
  apiBase: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL("/api/auth/oauth2/authorize", input.apiBase);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", TAKEOUT_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function postTokenRequest(apiBase: string, body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(new URL("/api/auth/oauth2/token", apiBase), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) throw new TokenEndpointError(response.status);

  const token: unknown = await response.json();
  if (!isTokenResponse(token)) throw new TokenEndpointError(response.status);
  return token;
}

function isTokenResponse(value: unknown): value is TokenResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<TokenResponse>).access_token === "string" &&
    typeof (value as Partial<TokenResponse>).token_type === "string" &&
    typeof (value as Partial<TokenResponse>).expires_in === "number" &&
    typeof (value as Partial<TokenResponse>).scope === "string" &&
    ((value as Partial<TokenResponse>).refresh_token === undefined ||
      typeof (value as Partial<TokenResponse>).refresh_token === "string")
  );
}

export async function exchangeAuthorizationCode(input: {
  apiBase: string;
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  return postTokenRequest(
    input.apiBase,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    }),
  );
}

export async function refreshAccessToken(input: {
  apiBase: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  return postTokenRequest(
    input.apiBase,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    }),
  );
}
