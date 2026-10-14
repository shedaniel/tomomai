import type { RenderMessage } from '@tomomai/render-token';
import { getCatalog } from '../../lib/catalog';
import { joinChunithmChart, type ChunithmRatingImage } from '../../lib/chunithm/charts';
import { ratingImageResources, renderRatingImage } from '../../lib/chunithm/render-image';
import { renderToWebp, type RenderOutcome } from '../../render-route';

/**
 * CHUNITHM export-image route: the rating breakdown. The token carries the snapshot's stored
 * selection with each chart's rating, and catalog fields are joined from /api/v1/games/chunithm/songs.
 */
export async function renderChunithmExportImage(
  message: Extract<RenderMessage, { game: 'chunithm'; route: 'export-image' }>,
  opts: { requestId: string; profile: boolean },
): Promise<RenderOutcome> {
  const { header, payload } = message;
  const catalog = await getCatalog('chunithm', [...payload.newCharts, ...payload.oldCharts].map(chart => chart.songId));
  const image: ChunithmRatingImage = {
    header,
    visitableProfileAt: payload.visitableProfileAt,
    newCharts: payload.newCharts.map(chart => joinChunithmChart(catalog, chart)),
    oldCharts: payload.oldCharts.map(chart => joinChunithmChart(catalog, chart)),
  };

  return renderToWebp({
    routeName: 'chunithm-export-image',
    requestId: opts.requestId,
    scale: header.scale,
    profile: opts.profile,
    resources: ratingImageResources(image),
    render: (cache) => renderRatingImage(image, cache),
    filename: 'chunithm-rating',
  });
}
