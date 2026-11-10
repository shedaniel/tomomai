import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

// Public clients have no secret, so refresh token rotation and reuse detection are the whole defence for
// the mobile app's long-lived sign-in. This runs Better Auth's OAuth provider with the options that
// matter (PKCE, rotation, offline_access) to pin the behaviour the app and the OAuth guide rely on.

const BASE_URL = "http://localhost:3000";
const REDIRECT = "https://tomomai.lol/oauth/app-callback";

const MODELS = [
  "user",
  "session",
  "account",
  "verification",
  "jwks",
  "oauthClient",
  "oauthAccessToken",
  "oauthRefreshToken",
  "oauthConsent",
];

// The memory adapter needs a table for every model the plugins use.
function tables(): Record<string, unknown[]> {
  return Object.fromEntries(MODELS.map((model) => [model, []]));
}

function createAuth() {
  return betterAuth({
    baseURL: BASE_URL,
    secret: "test-secret-test-secret-test-secret-0",
    database: memoryAdapter(tables()),
    emailAndPassword: { enabled: true },
    plugins: [
      jwt({ disableSettingJwtHeader: true }),
      oauthProvider({
        loginPage: "/oauth/consent",
        consentPage: "/oauth/consent",
        allowPublicClientPrelogin: true,
        silenceWarnings: { oauthAuthServerConfig: true },
        accessTokenExpiresIn: 3600,
        refreshTokenExpiresIn: 2592000,
        scopes: ["read", "offline_access"],
        validAudiences: [BASE_URL],
      }),
    ],
  });
}

type TestAuth = ReturnType<typeof createAuth>;

async function signUp(auth: TestAuth, email: string) {
  const response = await auth.api.signUpEmail({
    body: { email, password: "correct horse battery staple", name: email },
    asResponse: true,
  });
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(cookie).not.toBe("");
  return cookie;
}

async function signInWithCode(auth: TestAuth, cookie: string, clientId: string) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorize = new URL("/api/auth/oauth2/authorize", BASE_URL);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope: "read offline_access",
    state: "state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  const redirect = await auth.handler(new Request(authorize, { headers: { cookie }, redirect: "manual" }));
  const code = new URL(redirect.headers.get("location") ?? "").searchParams.get("code");
  expect(code).toBeTruthy();
  return { code: code!, verifier };
}

async function token(auth: TestAuth, params: Record<string, string>) {
  const response = await auth.handler(
    new Request(new URL("/api/auth/oauth2/token", BASE_URL), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, string> };
}

describe("refresh token rotation for a public client", () => {
  let auth: TestAuth;
  let clientId: string;
  let cookie: string;

  beforeAll(async () => {
    auth = createAuth();
    cookie = await signUp(auth, "player@example.com");
    const client = await auth.api.adminCreateOAuthClient({
      body: {
        client_name: "native",
        redirect_uris: [REDIRECT],
        scope: "read offline_access",
        token_endpoint_auth_method: "none",
        type: "native",
        skip_consent: true,
        metadata: { official: true },
      },
      headers: new Headers({ cookie }),
    });
    clientId = client.client_id;
    expect(client.client_secret).toBeUndefined();
  });

  async function freshTokens() {
    const { code, verifier } = await signInWithCode(auth, cookie, clientId);
    const exchanged = await token(auth, {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: clientId,
    });
    expect(exchanged.status).toBe(200);
    expect(exchanged.body.refresh_token).toBeTruthy();
    return exchanged.body;
  }

  const refresh = (refreshToken: string) =>
    token(auth, { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId });

  it("signs in without a secret and needs the PKCE verifier", async () => {
    const { code } = await signInWithCode(auth, cookie, clientId);
    const withoutVerifier = await token(auth, {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
    });
    expect(withoutVerifier.status).toBe(400);
  });

  it("hands out a new refresh token on every use", async () => {
    const first = await freshTokens();
    const second = await refresh(first.refresh_token!);
    expect(second.status).toBe(200);
    expect(second.body.refresh_token).toBeTruthy();
    expect(second.body.refresh_token).not.toBe(first.refresh_token);
    expect((await refresh(second.body.refresh_token!)).status).toBe(200);
  });

  it("refuses a refresh token that was already used", async () => {
    const first = await freshTokens();
    expect((await refresh(first.refresh_token!)).status).toBe(200);
    const replay = await refresh(first.refresh_token!);
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("invalid_grant");
  });

  it("revokes the user's refresh tokens from every sign-in to the client once an old one is replayed", async () => {
    const otherDevice = await freshTokens();
    const first = await freshTokens();
    const rotated = await refresh(first.refresh_token!);
    expect(rotated.status).toBe(200);

    expect((await refresh(first.refresh_token!)).status).toBe(400);
    expect((await refresh(rotated.body.refresh_token!)).status).toBe(400);
    expect((await refresh(otherDevice.refresh_token!)).status).toBe(400);
  });
});
