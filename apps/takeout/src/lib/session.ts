import { requireSessionSecret } from "./env";

export const SESSION_COOKIE = "takeout_session";
export const OAUTH_STATE_COOKIE = "takeout_oauth_state";
export const PKCE_VERIFIER_COOKIE = "takeout_pkce_verifier";

export type TakeoutSession = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
};

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function encodeBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function decodeBase64url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bytes = Buffer.from(value, "base64url");
    const out = new Uint8Array(bytes.byteLength);
    out.set(bytes);
    return out;
  } catch {
    return null;
  }
}

async function deriveKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requireSessionSecret()));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function isTakeoutSession(value: unknown): value is TakeoutSession {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<TakeoutSession>).accessToken === "string" &&
    typeof (value as Partial<TakeoutSession>).expiresAt === "number" &&
    typeof (value as Partial<TakeoutSession>).scope === "string" &&
    ((value as Partial<TakeoutSession>).refreshToken === null ||
      typeof (value as Partial<TakeoutSession>).refreshToken === "string")
  );
}

export async function sealSession(session: TakeoutSession): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await deriveKey();
  const plaintext = new TextEncoder().encode(JSON.stringify(session));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return `${encodeBase64url(iv)}.${encodeBase64url(new Uint8Array(ciphertext))}`;
}

export async function unsealSession(value: string): Promise<TakeoutSession | null> {
  const [ivPart, ciphertextPart, extra] = value.split(".");
  if (!ivPart || !ciphertextPart || extra !== undefined) return null;

  const iv = decodeBase64url(ivPart);
  const ciphertext = decodeBase64url(ciphertextPart);
  if (!iv || iv.byteLength !== 12 || !ciphertext) return null;

  try {
    const key = await deriveKey();
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
    return isTakeoutSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(baseUrl: string): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: baseUrl.startsWith("https://"),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function transientOAuthCookieOptions(baseUrl: string): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/api/auth";
  maxAge: 600;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: baseUrl.startsWith("https://"),
    path: "/api/auth",
    maxAge: 600,
  };
}
