import type { RenderMessage } from '@tomomai/render-token';
import type { RenderOutcome } from '../render-route';
import { renderExportImage } from './export-image';
import { renderLastCredit } from './last-credit';
import { renderDailyPlays } from './daily-plays';
import { renderChunithmExportImage } from './chunithm/export-image';
import { renderChunithmDailyPlays } from './chunithm/daily-plays';

/**
 * Dispatches on the decoded RenderMessage's game and route. Each handler joins the token
 * data with the game's song catalogue and renders. No DB access anywhere.
 */
export async function renderOutcomeFor(
  message: RenderMessage,
  opts: { requestId: string; profile: boolean },
): Promise<RenderOutcome> {
  if (message.game === 'chunithm') {
    switch (message.route) {
      case 'export-image':
        return renderChunithmExportImage(message, opts);
      case 'daily-plays':
        return renderChunithmDailyPlays(message, opts);
    }
  }
  switch (message.route) {
    case 'export-image':
      return renderExportImage(message, opts);
    case 'last-credit':
      return renderLastCredit(message, opts);
    case 'daily-plays':
      return renderDailyPlays(message, opts);
  }
}
