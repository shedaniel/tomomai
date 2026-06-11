import { getServerSession } from '@/lib/auth-server';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { user, userSnapshots } from '@/lib/db/schema-pg';
import { and, eq } from 'drizzle-orm';
import { renderDailyPlaysImage } from '@/lib/render-image';
import { commonSnapshotResources, renderWebpResponse } from '@/lib/render-image-route';
import { prepareDailyPlaysData } from '@/server/services/daily-plays-data';
import { getEnabledRegions } from "@tomomai/catalog/enabled-regions";
import { z } from 'zod';

export const dynamic = "force-dynamic";

const searchParams = z.object({
  region: z.enum(getEnabledRegions()),
  snapshotId: z.string().min(1).optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  return renderWebpResponse({
    request,
    routeName: "daily-plays",
    searchParams,
    prepareData: async ({ region, snapshotId, day }, log) => {
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

      const result = await prepareDailyPlaysData(userId, region, day);
      if (result.type === "error") {
        return { type: "error", status: 404, message: result.error };
      }
      return {
        type: "ok",
        data: { ...result, region },
      };
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
