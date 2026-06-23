import { renderDailyPlaysImage } from '../lib/render-image';
import { prepareDailyPlaysData } from '../server/services/daily-plays-data';
import { commonSnapshotResources, defineRenderJob } from '../render-route';
import type { RenderTokenPayload } from '../token';

export function buildDailyPlaysJob(
  payload: RenderTokenPayload,
  opts: { requestId: string; profile: boolean },
) {
  return defineRenderJob({
    routeName: 'daily-plays',
    requestId: opts.requestId,
    scale: payload.scale,
    profile: opts.profile,
    prepareData: async () => {
      const result = await prepareDailyPlaysData(payload.userId!, payload.region!, payload.day);
      if (result.type === 'error') {
        return { type: 'error', status: 404, message: result.error };
      }
      return { type: 'ok', data: { ...result, region: payload.region! } };
    },
    resources: ({ plays, snapshot, region }) => [
      ...commonSnapshotResources(snapshot, region),
      ...plays.map(p => p.cover),
    ],
    render: ({ plays, snapshot, region, day }, cache) =>
      renderDailyPlaysImage(plays, snapshot, region, day, cache),
    filename: ({ day }) => `maimai-daily-${day}`,
  });
}
