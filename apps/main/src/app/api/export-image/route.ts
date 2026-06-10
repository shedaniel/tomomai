import { splitSongs } from '@/lib/rating-calculator';
import { renderImage } from '@/lib/render-image';
import type { Region } from '@/lib/types';
import { NextRequest } from 'next/server';
import { commonSnapshotResources, renderWebpResponse } from '@/lib/render-image-route';
import { prepareExportImageData } from '@/server/queries/export-image';
import { getEnabledRegions } from "@tomomai/catalog/enabled-regions";
import { z } from 'zod';

export const dynamic = "force-dynamic";

const searchParams = z.object({
  snapshotId: z.string().min(1),
  username: z.string().optional(),
  region: z.enum(getEnabledRegions()).optional(),
});

export async function GET(request: NextRequest) {
  return renderWebpResponse({
    request,
    routeName: "export-image",
    searchParams,
    prepareData: async ({ snapshotId, username, region }) => {
      const result = await prepareExportImageData(snapshotId, username, region as Region | undefined);
      if (result.type === "error") {
        return { type: "error", status: 404, message: result.error };
      }
      return {
        type: "ok",
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
