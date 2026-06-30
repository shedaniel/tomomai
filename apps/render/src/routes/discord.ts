import { renderOutcomeFor } from './dispatch';
import { uploadDiscordFollowup } from '../lib/discord-followup';
import { logger } from '../lib/logger';
import type { RenderMessage } from '@tomomai/render-token';

export interface DiscordRenderRequest {
  applicationId: string;
  interactionToken: string;
  /** The Discord message body (content/embeds/components) composed by apps/main. */
  payloadJson: unknown;
  filename: string;
}

/**
 * Discord delivery: render the image for the decoded message, then upload it as
 * the interaction followup. On a render error we return the status to apps/main,
 * which posts its own text fallback (it owns the Discord error UX).
 */
export async function handleDiscordRender(
  message: RenderMessage,
  req: DiscordRenderRequest,
  requestId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const outcome = await renderOutcomeFor(message, { requestId, profile: false });
  if (!outcome.ok) {
    return { status: outcome.status, body: outcome.body };
  }
  await uploadDiscordFollowup(req.applicationId, req.interactionToken, req.payloadJson, outcome.buffer, req.filename);
  logger.info({ requestId, route: message.route, size: outcome.buffer.length }, 'Uploaded Discord followup');
  return { status: 200, body: { ok: true, requestId } };
}
