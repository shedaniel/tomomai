import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { nanoid } from 'nanoid';

import { logger } from './lib/logger';
import { verifyRenderToken, isExpired, type RenderMessage } from './token';
import { renderOutcomeFor } from './routes/dispatch';
import { outcomeToResponse } from './render-route';
import { handleDiscordRender } from './routes/discord';

const SECRET: string = (() => {
  const s = process.env.RENDER_TOKEN_SECRET;
  if (!s) throw new Error('RENDER_TOKEN_SECRET is required');
  return s;
})();
const PORT = Number(process.env.PORT ?? 8080);
const isProd = process.env.NODE_ENV === 'production';

const app = new Hono();

// The web download button does `fetch(/img).blob()` cross-origin (apps/main →
// render), so the response needs CORS. /img is token-gated and uses no cookies,
// so a permissive origin is fine; set CORS_ORIGIN to lock it to the site origin.
const corsOrigin = process.env.CORS_ORIGIN ?? '*';
app.use('/img', cors({ origin: corsOrigin }));

app.get('/health', (c) => c.json({ ok: true }));

/**
 * Verify a token (HMAC signature + version + expiry) and decode the binary
 * payload into a RenderMessage. Shared by /img and /discord/render.
 */
function verifyAndDecode(token: string, requestId: string): { ok: true; message: RenderMessage } | { ok: false; response: Response } {
  const verified = verifyRenderToken(token, SECRET);
  if (!verified.ok) {
    // bad-signature / malformed / unsupported-version → all 401.
    // (expiry is checked separately below → 410.)
    logger.warn({ requestId, reason: verified.reason }, 'Token rejected');
    return {
      ok: false,
      response: Response.json(
        { error: `Invalid token: ${verified.reason}`, requestId },
        { status: 401 },
      ),
    };
  }

  if (isExpired(verified.message.header.exp)) {
    logger.warn({ requestId }, 'Token expired');
    return {
      ok: false,
      response: Response.json(
        { error: 'Invalid token: expired', requestId },
        { status: 410 },
      ),
    };
  }

  return { ok: true, message: verified.message };
}

// Web delivery: render and return the webp (apps/main 302s here with the token
// carrying the full render payload — no DB access needed).
app.get('/img', async (c) => {
  const requestId = c.req.header('x-request-id') ?? nanoid(10);
  const token = c.req.query('t');
  if (!token) {
    return c.json({ error: 'Missing token', requestId }, 400);
  }

  const decoded = verifyAndDecode(token, requestId);
  if (!decoded.ok) {
    return decoded.response;
  }

  // Profiling is dev-only (it logs a full span tree to stdout).
  const profile = !isProd && c.req.query('profile') === '1';
  const outcome = await renderOutcomeFor(decoded.message, { requestId, profile });
  return outcomeToResponse(outcome, requestId);
});

// Discord delivery: render and upload the interaction followup directly to
// Discord (keeps the image bytes off Vercel). apps/main composes the message
// body and passes the signed token.
app.post('/discord/render', async (c) => {
  const requestId = c.req.header('x-request-id') ?? nanoid(10);

  let body: {
    t?: string;
    applicationId?: string;
    interactionToken?: string;
    payloadJson?: unknown;
    filename?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body', requestId }, 400);
  }

  const { t, applicationId, interactionToken, payloadJson, filename } = body;
  if (!t || !applicationId || !interactionToken || !filename) {
    return c.json({ error: 'Missing token / applicationId / interactionToken / filename', requestId }, 400);
  }

  const decoded = verifyAndDecode(t, requestId);
  if (!decoded.ok) {
    return decoded.response;
  }

  try {
    const result = await handleDiscordRender(
      decoded.message,
      { applicationId, interactionToken, payloadJson, filename },
      requestId,
    );
    return c.json(result.body, result.status as never);
  } catch (error) {
    logger.error({ requestId, err: error }, 'Discord render/upload failed');
    return c.json({ error: 'Discord render failed', requestId }, 500);
  }
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  logger.info({ port: info.port }, 'Render service listening');
});
