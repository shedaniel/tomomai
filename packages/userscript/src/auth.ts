import { GM_getValue, GM_setValue, GM_xmlhttpRequest } from "vite-plugin-monkey/dist/client";
import { ScriptError } from "./locale";

const KEY_ACCESS_TOKEN = "tomomai_access_token";
const KEY_REFRESH_TOKEN = "tomomai_refresh_token";
const KEY_EXPIRES_AT = "tomomai_token_expires_at";

const SCOPES = "offline_access fetch:token:write";

// Both are filled in by the route that serves the script, so one build works on every deployment.
export const API_BASE: string = __API_BASE__;
const CLIENT_ID: string = __USERSCRIPT_CLIENT_ID__;
const REDIRECT_URI = `${API_BASE}/userscript/callback`;

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

export class SignInRequired extends ScriptError {
  constructor() {
    super("signInExpired");
  }
}

export type JsonResponse = { status: number; body: Record<string, unknown> };

/**
 * Talks to tomomai without the page's cookies, which also keeps tomomai's sign-in session out of it.
 * The manager makes the request, so the SEGA page's CORS rules do not apply.
 */
export function request(method: string, url: string, init: { headers?: Record<string, string>; data?: string } = {}): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: method as "GET",
      url,
      headers: init.headers,
      data: init.data,
      anonymous: true,
      onload(res) {
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(res.responseText) as Record<string, unknown>;
        } catch {
          // Leave the body empty, the status says what happened.
        }
        resolve({ status: res.status, body });
      },
      onerror() {
        reject(new ScriptError("unreachable"));
      },
      ontimeout() {
        reject(new ScriptError("timeout"));
      },
      timeout: 20_000,
    });
  });
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const { status, body } = await request("POST", `${API_BASE}/api/auth/oauth2/token`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams({ client_id: CLIENT_ID, resource: API_BASE, ...params }).toString(),
  });
  if (status === 200 && typeof body.access_token === "string" && typeof body.expires_in === "number") {
    return body as TokenResponse;
  }
  if (body.error === "invalid_grant") throw new SignInRequired();
  throw new ScriptError("signInFailed", { status: String(body.error ?? status) });
}

function store(tokens: TokenResponse): void {
  GM_setValue(KEY_ACCESS_TOKEN, tokens.access_token);
  if (tokens.refresh_token) GM_setValue(KEY_REFRESH_TOKEN, tokens.refresh_token);
  GM_setValue(KEY_EXPIRES_AT, Date.now() + tokens.expires_in * 1000);
}

export function signOut(): void {
  GM_setValue(KEY_ACCESS_TOKEN, null);
  GM_setValue(KEY_REFRESH_TOKEN, null);
  GM_setValue(KEY_EXPIRES_AT, 0);
}

export function isSignedIn(): boolean {
  return Boolean(GM_getValue(KEY_REFRESH_TOKEN, null) ?? GM_getValue(KEY_ACCESS_TOKEN, null));
}

/** A current access token. Refreshes it when it is about to expire, and asks for a new sign-in when that fails. */
export async function accessToken(): Promise<string> {
  const access = GM_getValue(KEY_ACCESS_TOKEN, null) as string | null;
  const expiresAt = GM_getValue(KEY_EXPIRES_AT, 0) as number;
  if (access && Date.now() < expiresAt - 60_000) return access;
  const refresh = GM_getValue(KEY_REFRESH_TOKEN, null) as string | null;
  if (!refresh) throw new SignInRequired();
  try {
    const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
    store(tokens);
    return tokens.access_token;
  } catch (err) {
    // A refresh token is single use, so a failed one is gone either way.
    if (err instanceof SignInRequired) signOut();
    throw err;
  }
}

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
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/**
 * Opens tomomai's sign-in in a popup and exchanges the code it returns. Call it straight from a click,
 * since browsers block popups opened later.
 */
export function signIn(): Promise<void> {
  const state = randomString(16);
  const verifier = randomString(32);
  // Opened before the challenge is ready so the click still counts, then pointed at the sign-in.
  const popup = window.open("about:blank", "tomomai-sign-in", "width=500,height=720");
  if (!popup) return Promise.reject(new ScriptError("popupBlocked"));

  return new Promise<void>((resolve, reject) => {
    const apiOrigin = new URL(API_BASE).origin;
    let closedPoll: ReturnType<typeof setInterval> | undefined;
    const finish = (error?: Error) => {
      window.removeEventListener("message", onMessage);
      clearInterval(closedPoll);
      if (!popup.closed) popup.close();
      if (error) reject(error);
      else resolve();
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as Record<string, unknown> | null;
      if (event.origin !== apiOrigin || data?.source !== "tomomai-userscript" || data.state !== state) return;
      // The callback closes itself right away, which must not fail the exchange that is now running.
      clearInterval(closedPoll);
      if (typeof data.code !== "string") {
        finish(data.error === "access_denied" ? new ScriptError("signInCancelled") : new ScriptError("signInFailed", { status: String(data.error ?? "error") }));
        return;
      }
      tokenRequest({ grant_type: "authorization_code", code: data.code, code_verifier: verifier, redirect_uri: REDIRECT_URI })
        .then(tokens => {
          store(tokens);
          finish();
        })
        .catch((err: unknown) => finish(err instanceof Error ? err : new Error(String(err))));
    };
    window.addEventListener("message", onMessage);

    closedPoll = setInterval(() => {
      if (popup.closed) finish(new ScriptError("signInClosed"));
    }, 500);

    pkceChallenge(verifier).then(challenge => {
      const params = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource: API_BASE,
      });
      popup.location.href = `${API_BASE}/api/auth/oauth2/authorize?${params}`;
    }, (err: unknown) => finish(err instanceof Error ? err : new Error(String(err))));
  });
}
