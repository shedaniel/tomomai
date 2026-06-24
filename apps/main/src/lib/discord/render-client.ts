import { mintRenderToken, type RenderMessage } from '@tomomai/render-token';

/**
 * Asks the render service (apps/render) to render an image and upload it as
 * the Discord interaction followup. apps/main does all data prep (building the
 * RenderMessage) and authorizes the render by minting a signed token; the image
 * bytes go render → Discord directly (never through Vercel).
 *
 * Throws on a non-2xx so callers can post their own text fallback.
 */
export async function requestDiscordRender(args: {
  message: RenderMessage;
  applicationId: string;
  interactionToken: string;
  /** Discord message body (content/embeds/components). */
  payloadJson: unknown;
  filename: string;
}): Promise<void> {
  const secret = process.env.RENDER_TOKEN_SECRET;
  const base = process.env.RENDER_INTERNAL_URL ?? process.env.RENDER_PUBLIC_URL;
  if (!secret) throw new Error('RENDER_TOKEN_SECRET is not set');
  if (!base) throw new Error('RENDER_INTERNAL_URL / RENDER_PUBLIC_URL is not set');

  const token = mintRenderToken(args.message, secret);

  // Bound the call so a stalled render service can't hang the Vercel function —
  // a timeout lets us fall back to the text message instead of never returning.
  // 25s leaves headroom under Vercel's default function timeout for the caller's
  // own fallback handling.
  const res = await fetch(`${base.replace(/\/$/, '')}/discord/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      t: token,
      applicationId: args.applicationId,
      interactionToken: args.interactionToken,
      payloadJson: args.payloadJson,
      filename: args.filename,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`render /discord/render failed: ${res.status} ${await res.text()}`);
  }
}
