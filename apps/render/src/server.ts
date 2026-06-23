import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { nanoid } from 'nanoid';

import { logger } from './lib/logger';
import { verifyRenderToken } from './token';
import { renderOutcomeFor } from './routes/dispatch';
import { outcomeToResponse } from './render-route';
import { handleDiscordRender } from './routes/discord';

const SECRET = process.env.RENDER_TOKEN_SECRET;
if (!SECRET) {
  throw new Error('RENDER_TOKEN_SECRET is required');
}
const PORT = Number(process.env.PORT ?? 8080);
const isProd = process.env.NODE_ENV === 'production';

const app = new Hono();

// The web download button does `fetch(/img).blob()` cross-origin (apps/main →
// render), so the response needs CORS. /img is token-gated and uses no cookies,
// so a permissive origin is fine; set CORS_ORIGIN to lock it to the site origin.
const corsOrigin = process.env.CORS_ORIGIN ?? '*';
app.use('/img', cors({ origin: corsOrigin }));

app.get('/health', (c) => c.json({ ok: true }));

// Web delivery: render and return the webp (apps/main 302s here).
app.get('/img', async (c) => {
  const requestId = c.req.header('x-request-id') ?? nanoid(10);
  const token = c.req.query('t');
  if (!token) {
    return c.json({ error: 'Missing token', requestId }, 400);
  }

  const verified = verifyRenderToken(token, SECRET);
  if (!verified.ok) {
    const status = verified.reason === 'expired' ? 410 : 401;
    logger.warn({ requestId, reason: verified.reason }, 'Token rejected');
    return c.json({ error: `Invalid token: ${verified.reason}`, requestId }, status);
  }

  // Profiling is dev-only (it logs a full span tree to stdout).
  const profile = !isProd && c.req.query('profile') === '1';
  const outcome = await renderOutcomeFor(verified.payload, { requestId, profile });
  return outcomeToResponse(outcome, requestId);
});

// Discord delivery: render and upload the interaction followup directly to
// Discord (keeps the image bytes off Vercel). apps/main composes the message
// body and passes the interaction token.
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

  const verified = verifyRenderToken(t, SECRET);
  if (!verified.ok) {
    const status = verified.reason === 'expired' ? 410 : 401;
    logger.warn({ requestId, reason: verified.reason }, 'Token rejected');
    return c.json({ error: `Invalid token: ${verified.reason}`, requestId }, status);
  }

  try {
    const result = await handleDiscordRender(
      verified.payload,
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
