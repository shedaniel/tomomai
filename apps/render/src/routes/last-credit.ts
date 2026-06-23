import { renderLastCreditImage } from '../lib/render-image';
import { DIFFICULTY_ENUM } from '../lib/db/types';
import { prepareCreditData } from '../server/services/credit-data';
import { commonSnapshotResources, defineRenderJob } from '../render-route';
import type { RenderTokenPayload } from '../token';

export function buildLastCreditJob(
  payload: RenderTokenPayload,
  opts: { requestId: string; profile: boolean },
) {
  return defineRenderJob({
    routeName: 'last-credit',
    requestId: opts.requestId,
    scale: payload.scale,
    profile: opts.profile,
    prepareData: async () => {
      const beforeDate = payload.beforeDate ? new Date(payload.beforeDate) : undefined;
      const result = await prepareCreditData(payload.userId!, payload.region!, beforeDate);
      if (result.type === 'error') {
        return { type: 'error', status: 404, message: result.error };
      }
      return {
        type: 'ok',
        data: { credit: result.credit, snapshot: result.snapshot, region: payload.region! },
      };
    },
    resources: ({ credit, snapshot, region }) => [
      ...commonSnapshotResources(snapshot, region),
      `/res/bg/${snapshot.gameVersion}_long.png`,
      ...['percentage_blue', 'percentage_red', 'percentage_gold',
        'score_blue', 'score_red', 'score_gold', 'score_big_blue', 'score_big_red', 'score_big_gold',
        'score_num_count', 'score_num_count_big',
        'level_basic', 'level_advanced', 'level_expert', 'level_master', 'level_remaster', 'level_utage']
        .map(path => `/res/numbers/${path}.png`),
      ...['score_table', 'fast_late', 'track_1', 'track_2', 'track_3',
        'dxscore', 'star_1', 'star_2', 'star_3']
        .map(path => `/res/songs/${path}.png`),
      ...['base', 'sync_base', 'sync', 'fc_base', 'fc', 'fc+', 'ap_base', 'ap', 'ap+',
        'fs_base', 'fs', 'fs+', 'fdx_base', 'fdx', 'fdx+']
        .map(path => `/res/icons/${path}.png`),
      ...Object.values(DIFFICULTY_ENUM).map(difficulty => `/res/songs/song_${difficulty}.png`),
      ...Object.values(DIFFICULTY_ENUM).map(difficulty => `/res/songs/music_jacket_${difficulty}.png`),
      ...credit.tracks.map(s => s.cover),
    ],
    render: ({ credit, snapshot, region }, cache) =>
      renderLastCreditImage(credit, snapshot, region, cache),
    filename: () => `maimai-last-credit`,
  });
}
