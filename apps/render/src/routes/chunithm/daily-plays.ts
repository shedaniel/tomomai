import type { RenderMessage } from '@tomomai/render-token';
import { getCatalog } from '../../lib/catalog';
import { joinChunithmChart, type ChunithmDailyPlaysImage } from '../../lib/chunithm/charts';
import { dailyPlaysImageResources, renderDailyPlaysImage } from '../../lib/chunithm/render-image';
import { renderToWebp, type RenderOutcome } from '../../render-route';

/** CHUNITHM daily-plays route: the token carries the day's plays with each one's rating. */
export async function renderChunithmDailyPlays(
  message: Extract<RenderMessage, { game: 'chunithm'; route: 'daily-plays' }>,
  opts: { requestId: string; profile: boolean },
): Promise<RenderOutcome> {
  const { header, payload } = message;
  const catalog = await getCatalog('chunithm', payload.plays.map(play => play.songId));
  const image: ChunithmDailyPlaysImage = {
    header,
    day: payload.day,
    plays: payload.plays.map(play => joinChunithmChart(catalog, play)),
  };

  return renderToWebp({
    routeName: 'chunithm-daily-plays',
    requestId: opts.requestId,
    scale: header.scale,
    profile: opts.profile,
    resources: dailyPlaysImageResources(image),
    render: (cache) => renderDailyPlaysImage(image, cache),
    filename: `chunithm-daily-${payload.day}`,
  });
}
