/**
 * Thin wrapper around @tomomai/render-token for apps/main.
 *
 * apps/main does ALL data prep (see lib/render-data.ts), builds a
 * `RenderMessage`, then either:
 *   - 302s the client to  `${RENDER_PUBLIC_URL}/img?t=<token>`  (web download)
 *   - POSTs the token to  `${RENDER_INTERNAL_URL}/discord/render`  (Discord)
 *
 * The token carries the full render payload (HMAC-signed); apps/render has zero
 * DB access. See docs/render-token-v1.md for the wire format.
 */

import {
  mintRenderToken,
  type RenderMessage,
} from "@tomomai/render-token";

function getSecret(): string {
  const secret = process.env.RENDER_TOKEN_SECRET;
  if (!secret) throw new Error("RENDER_TOKEN_SECRET is not set");
  return secret;
}

function getPublicBase(): string {
  const base = process.env.RENDER_PUBLIC_URL;
  if (!base) throw new Error("RENDER_PUBLIC_URL is not set");
  return base.replace(/\/$/, "");
}

/** Mint a signed token for a fully-prepared RenderMessage. */
export function mintToken(message: RenderMessage): string {
  return mintRenderToken(message, getSecret());
}

/**
 * Build the absolute `/img` redirect URL for a prepared RenderMessage.
 * Extracts `scale` from the incoming query for backward compat (scale=1 → 1).
 */
export function renderRedirectUrl(
  searchParams: URLSearchParams,
  message: RenderMessage,
): string {
  // Override scale from query (the only field the client still controls).
  const scale: 1 | 2 = searchParams.get("scale") === "1" ? 1 : 2;
  message.header.scale = scale;
  const token = mintToken(message);
  return `${getPublicBase()}/img?t=${token}`;
}

export { mintToken as mintRenderToken };
export type { RenderMessage };
