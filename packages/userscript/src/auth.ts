import {
  GM_getValue,
  GM_setValue,
  GM_xmlhttpRequest,
} from "vite-plugin-monkey/dist/client";

const KEY_ACCESS_TOKEN = "tomomai_access_token";
const KEY_REFRESH_TOKEN = "tomomai_refresh_token";
const KEY_EXPIRES_AT = "tomomai_token_expires_at";

// __API_BASE__ is replaced at build time from VITE_API_BASE / BETTER_AUTH_URL
// env vars (see vite.config.ts). This ensures localhost dev builds point to
// localhost rather than always resolving to the production @downloadURL.
export function getApiBase(): string {
  return __API_BASE__;
}

export function getStoredToken(): string | null {
  return (GM_getValue(KEY_ACCESS_TOKEN, null) as string | null) ?? null;
}

export function isTokenExpired(): boolean {
  const expiresAt = GM_getValue(KEY_EXPIRES_AT, 0) as number;
  return Date.now() >= expiresAt - 30_000; // 30s buffer
}

export function setStoredToken(
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): void {
  GM_setValue(KEY_ACCESS_TOKEN, accessToken);
  GM_setValue(KEY_REFRESH_TOKEN, refreshToken);
  GM_setValue(KEY_EXPIRES_AT, Date.now() + expiresIn * 1000);
}

export function clearStoredToken(): void {
  GM_setValue(KEY_ACCESS_TOKEN, null);
  GM_setValue(KEY_REFRESH_TOKEN, null);
  GM_setValue(KEY_EXPIRES_AT, 0);
}

export type MeData = {
  username: string;
  region: string;
  publishProfile: boolean;
  role: string;
};

export function fetchMe(token: string): Promise<MeData> {
  const base = getApiBase();
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url: `${base}/api/v1/me`,
      headers: { Authorization: `Bearer ${token}` },
      onload(res) {
        if (res.status === 200) {
          resolve(JSON.parse(res.responseText) as MeData);
        } else {
          reject(new Error(`${res.status}`));
        }
      },
      onerror() {
        reject(new Error("network error"));
      },
    });
  });
}

type OAuthResult = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

function base64url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return base64url(new Uint8Array(digest));
}

function exchangeCode(
  code: string,
  verifier: string,
  redirectUri: string
): Promise<OAuthResult> {
  const base = getApiBase();
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "POST",
      url: `${base}/api/userscript/token`,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
      }),
      onload(res) {
        try {
          const body = JSON.parse(res.responseText) as Record<string, unknown>;
          if (res.status === 200 && typeof body.access_token === "string") {
            resolve(body as unknown as OAuthResult);
          } else {
            reject(new Error(String(body.error ?? `token exchange failed (${res.status})`)));
          }
        } catch {
          reject(new Error(`token exchange failed (${res.status})`));
        }
      },
      onerror() {
        reject(new Error("network error during token exchange"));
      },
    });
  });
}

export async function openLoginPopup(): Promise<OAuthResult> {
  const base = getApiBase();
  const state = randomString(16);
  const verifier = randomString(32);
  const challenge = await pkceChallenge(verifier);
  const redirectUri = `${base}/userscript/callback`;

  // __USERSCRIPT_CLIENT_ID__ is baked as a placeholder by vite.config.ts and
  // substituted at serve-time by the Next.js route, mirroring __API_BASE__.
  // This keeps a single prebuilt bundle working across environments and lets
  // the server rotate the OAuth client ID without rebuilding.
  const clientId = __USERSCRIPT_CLIENT_ID__;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "user:metadata:read",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    // RFC 8707. Binds the issued access token to our API as its audience and,
    // because Better Auth's JWT plugin is enabled, makes the access token a
    // JWT (signed via the /api/auth/jwks endpoint). Resource servers then
    // verify the JWT locally without needing client credentials, which is
    // what lets multiple OAuth apps share the same API verifier.
    resource: base,
  });

  const popup = window.open(
    `${base}/api/auth/oauth2/authorize?${params}`,
    "tomomai-login",
    "width=500,height=700,menubar=no,toolbar=no,location=no"
  );

  return new Promise((resolve, reject) => {
    let pollClosed: ReturnType<typeof setInterval> | undefined;
    const cleanup = () => {
      window.removeEventListener("message", handler);
      if (pollClosed) clearInterval(pollClosed);
    };

    const handler = async (event: MessageEvent) => {
      if (event.data?.source !== "tomomai-userscript") return;
      const data = event.data as Record<string, unknown>;
      // Only consume messages belonging to this login attempt.
      if (data.state && data.state !== state) return;

      cleanup();
      popup?.close();

      if (data.error) {
        reject(new Error(String(data.error)));
        return;
      }
      if (typeof data.code !== "string") {
        reject(new Error("invalid response"));
        return;
      }
      try {
        resolve(await exchangeCode(data.code, verifier, redirectUri));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    window.addEventListener("message", handler);

    // Clean up if popup is closed without completing
    pollClosed = setInterval(() => {
      if (popup?.closed) {
        cleanup();
        reject(new Error("popup closed"));
      }
    }, 500);
  });
}
