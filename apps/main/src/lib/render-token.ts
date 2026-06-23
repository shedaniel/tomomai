import { createHmac } from 'crypto';
import type { Region } from '@/lib/types';

/**
 * Mints short-lived signed tokens for the render service (apps/render). apps/main
 * is the auth boundary: it resolves the session / public snapshot, then mints a
 * token describing exactly what may be rendered and 302s the client to
 * `${RENDER_PUBLIC_URL}/img?t=…`. The render service verifies the signature and
 * trusts the payload.
 *
 * Token format MUST stay byte-compatible with apps/render/src/token.ts
 * (`base64url(JSON) + "." + base64url(HMAC-SHA256)`). This is a deliberate small
 * duplicate of the verify-side payload type; the catalogue PR reconciles it.
 */
export interface RenderTokenPayload {
  route: 'export-image' | 'last-credit' | 'daily-plays';
  /** Optional for export-image (the snapshot determines its region); required for the others. */
  region?: Region;
  scale: 1 | 2;
  snapshotId?: string;
  username?: string;
  userId?: string;
  beforeDate?: string;
  day?: string;
  exp: number;
}

const TTL_SECONDS = 300;

export function mintRenderToken(payload: RenderTokenPayload, secret: string): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Builds the absolute `/img` redirect URL for a render token. Reads `scale` from
 * the incoming query (`scale=1` → 1, else 2) and stamps a short expiry. Throws if
 * the render env is unset.
 */
export function renderRedirectUrl(
  searchParams: URLSearchParams,
  payload: Omit<RenderTokenPayload, 'scale' | 'exp'>,
): string {
  const secret = process.env.RENDER_TOKEN_SECRET;
  const base = process.env.RENDER_PUBLIC_URL;
  if (!secret) throw new Error('RENDER_TOKEN_SECRET is not set');
  if (!base) throw new Error('RENDER_PUBLIC_URL is not set');

  const scale: 1 | 2 = searchParams.get('scale') === '1' ? 1 : 2;
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const token = mintRenderToken({ ...payload, scale, exp }, secret);
  return `${base.replace(/\/$/, '')}/img?t=${encodeURIComponent(token)}`;
}
