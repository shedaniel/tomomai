import { renderToWebp, type RenderOutcome } from '../render-route';
import type { RenderTokenPayload } from '../token';
import { buildExportImageJob } from './export-image';
import { buildLastCreditJob } from './last-credit';
import { buildDailyPlaysJob } from './daily-plays';

/**
 * Renders the webp for a verified token payload, dispatching on `route`. Each
 * case is monomorphic (the specific job builder → renderToWebp), so the generic
 * `D` stays inferred without variance gymnastics. Both delivery modes — the
 * `/img` HTTP response and the Discord followup upload — go through here.
 */
export function renderOutcomeFor(
  payload: RenderTokenPayload,
  opts: { requestId: string; profile: boolean },
): Promise<RenderOutcome> {
  switch (payload.route) {
    case 'export-image':
      return renderToWebp(buildExportImageJob(payload, opts));
    case 'last-credit':
      return renderToWebp(buildLastCreditJob(payload, opts));
    case 'daily-plays':
      return renderToWebp(buildDailyPlaysJob(payload, opts));
    default:
      return Promise.resolve({
        ok: false,
        status: 400,
        body: { error: `Unknown route: ${(payload as { route?: string }).route}`, requestId: opts.requestId },
      });
  }
}
