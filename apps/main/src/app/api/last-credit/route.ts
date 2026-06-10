import { getServerSession } from '@/lib/auth-server';
import { NextRequest } from 'next/server';
import { renderLastCreditImage } from '@/lib/render-image';
import { commonSnapshotResources, renderWebpResponse } from '@/lib/render-image-route';
import { DIFFICULTY_ENUM } from '@/lib/db/types';
import { prepareCreditData } from '@/server/services/credit-data';
import { db } from '@/lib/db';
import { user, userSnapshots } from '@/lib/db/schema-pg';
import { and, eq } from 'drizzle-orm';
import { getEnabledRegions } from "@tomomai/catalog/enabled-regions";
import { z } from 'zod';

export const dynamic = "force-dynamic";

const searchParams = z.object({
  region: z.enum(getEnabledRegions()),
  snapshotId: z.string().min(1).optional(),
  beforeDate: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  return renderWebpResponse({
    request,
    routeName: "last-credit",
    searchParams,
    prepareData: async ({ region, snapshotId, beforeDate: beforeDateStr }, log) => {
      let userId: string;
      if (snapshotId) {
        const snapshot = await db
          .select({ userId: userSnapshots.userId })
          .from(userSnapshots)
          .innerJoin(user, eq(userSnapshots.userId, user.id))
          .where(and(
            eq(userSnapshots.publicId, snapshotId),
            eq(user.publishProfile, true)
          ))
          .limit(1);

        if (snapshot.length === 0) {
          return { type: "error", status: 404, message: 'Snapshot not found or not public' };
        }
        userId = snapshot[0].userId;
        log.info({ userId, snapshotId }, 'Public mode');
      } else {
        const session = await getServerSession();
        if (!session?.user?.id) {
          return { type: "error", status: 401, message: 'Unauthorized' };
        }
        userId = session.user.id;
        log.info({ userId }, 'Authenticated mode');
      }

      const beforeDate = beforeDateStr ? new Date(beforeDateStr) : undefined;
      const result = await prepareCreditData(userId, region, beforeDate);
      if (result.type === "error") {
        return { type: "error", status: 404, message: result.error };
      }
      return {
        type: "ok",
        data: { credit: result.credit, snapshot: result.snapshot, region },
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
