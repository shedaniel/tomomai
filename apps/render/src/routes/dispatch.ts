import type { RenderMessage } from '@tomomai/render-token';
import type { RenderOutcome } from '../render-route';
import { renderExportImage } from './export-image';
import { renderLastCredit } from './last-credit';
import { renderDailyPlays } from './daily-plays';

/**
 * Dispatches on the decoded RenderMessage's route. Each handler joins the token
 * data with the song catalogue and renders. No DB access anywhere.
 */
export async function renderOutcomeFor(
  message: RenderMessage,
  opts: { requestId: string; profile: boolean },
): Promise<RenderOutcome> {
  switch (message.route) {
    case 'export-image':
      return renderExportImage(message, opts);
    case 'last-credit':
      return renderLastCredit(message, opts);
    case 'daily-plays':
      return renderDailyPlays(message, opts);
  }
}
