import { createHmac, timingSafeEqual } from 'crypto';
import type { Region } from './lib/types';

/**
 * Authorization is done in apps/main. It resolves the session (or the public
 * snapshot) and mints a short-lived signed token describing exactly what may be
 * rendered, then 302s the client here. This service does NOT do auth — it only
 * verifies the signature and trusts the payload.
 *
 * Token format: `base64url(JSON payload) + "." + base64url(HMAC-SHA256)`.
 * Keep this format byte-compatible with apps/main's minting helper.
 */
export interface RenderTokenPayload {
  route: 'export-image' | 'last-credit' | 'daily-plays';
  /** Optional for export-image (the snapshot determines its region); required for the others. */
  region?: Region;
  scale: 1 | 2;
  /** Public-by-snapshot identity (export-image). */
  snapshotId?: string;
  /** Reserved-profile username (export-image). */
  username?: string;
  /** Resolved user id (last-credit / daily-plays), already authorized by apps/main. */
  userId?: string;
  /** last-credit: render the credit before this ISO timestamp. */
  beforeDate?: string;
  /** daily-plays: YYYY-MM-DD. */
  day?: string;
  /** Unix seconds. */
  exp: number;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payloadB64).digest());
}

export function mintRenderToken(payload: RenderTokenPayload, secret: string): string {
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

export type VerifyResult =
  | { ok: true; payload: RenderTokenPayload }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' };

export function verifyRenderToken(token: string, secret: string): VerifyResult {
  const dot = token.indexOf('.');
  if (dot <= 0) return { ok: false, reason: 'malformed' };
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad-signature' };
  }

  let payload: RenderTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, payload };
}
