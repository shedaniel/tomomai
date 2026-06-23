import { splitSongs } from '../lib/rating-calculator';
import { renderImage } from '../lib/render-image';
import type { Region } from '../lib/types';
import { prepareExportImageData } from '../server/queries/export-image';
import { commonSnapshotResources, defineRenderJob } from '../render-route';
import type { RenderTokenPayload } from '../token';

export function buildExportImageJob(
  payload: RenderTokenPayload,
  opts: { requestId: string; profile: boolean },
) {
  const snapshotId = payload.snapshotId!;
  return defineRenderJob({
    routeName: 'export-image',
    requestId: opts.requestId,
    scale: payload.scale,
    profile: opts.profile,
    prepareData: async () => {
      const result = await prepareExportImageData(
        snapshotId,
        payload.username,
        payload.region as Region | undefined,
      );
      if (result.type === 'error') {
        return { type: 'error', status: 404, message: result.error };
      }
      return {
        type: 'ok',
        data: {
          snapshotId,
          data: result.data,
          region: result.region,
          visitableProfileAt: result.visitableProfileAt,
        },
      };
    },
    resources: ({ data, region }) => {
      const { newSongsB15, oldSongsB35 } = splitSongs(data.songs, data.snapshot.gameVersion);
      return [
        ...commonSnapshotResources(data.snapshot, region),
        `/res/label/new.png`,
        `/res/label/old.png`,
        ...newSongsB15.map(s => s.cover),
        ...oldSongsB35.map(s => s.cover),
      ];
    },
    render: ({ data, region, visitableProfileAt }, cache) =>
      renderImage(data, region, cache, visitableProfileAt),
    filename: ({ snapshotId }) => `maimai-profile-snapshot-${snapshotId}`,
  });
}
