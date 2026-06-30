/**
 * Signed-token envelope: base64url(message) + "." + base64url(HMAC-SHA256).
 *
 * Token format MUST stay byte-compatible across apps/main (mint) and
 * apps/render (verify). The shared codec guarantees the message bytes match;
 * this module handles only the envelope + signature.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { decodeMessage, encodeMessage, VERSION } from "./codec";
import type { RenderMessage } from "./message";

// ---- base64url (no padding) ----

function b64urlEncode(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64url");
}

function b64urlDecode(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, "base64url"));
}

// ---- sign ----

function sign(message: Uint8Array, secret: string): string {
  const mac = createHmac("sha256", secret).update(message).digest();
  return b64urlEncode(mac);
}

function verifySig(message: Uint8Array, sigB64: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(message).digest();
  const got = Buffer.from(sigB64, "base64url");
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

// ---- public API ----

/** Encode + sign a RenderMessage into the URL-safe token string. */
export function mintRenderToken(msg: RenderMessage, secret: string): string {
  const message = encodeMessage(msg);
  return `${b64urlEncode(message)}.${sign(message, secret)}`;
}

export type VerifyResult =
  | { ok: true; message: RenderMessage }
  | { ok: false; reason: "malformed" | "bad-signature" | "unsupported-version" };

/** Verify signature + decode. Does NOT check expiry — caller does that. */
export function verifyRenderToken(token: string, secret: string): VerifyResult {
  const dot = token.indexOf(".");
  if (dot < 0) return { ok: false, reason: "malformed" };

  const msgB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let message: Uint8Array;
  try {
    message = b64urlDecode(msgB64);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!verifySig(message, sigB64, secret)) {
    return { ok: false, reason: "bad-signature" };
  }

  // Signature is valid → the message bytes are authentic. Decode them.
  // A version mismatch here means the *authentic* message was minted with
  // a version we don't support (old mint / new render, or vice-versa).
  if (message.length > 0 && message[0] !== VERSION) {
    return { ok: false, reason: "unsupported-version" };
  }

  try {
    const decoded = decodeMessage(message);
    return { ok: true, message: decoded };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

/** True if `exp` (unix seconds) is in the past. */
export function isExpired(exp: number, nowMs: number = Date.now()): boolean {
  return Math.floor(nowMs / 1000) > exp;
}
