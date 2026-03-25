import { type NextRequest } from "next/server";
import { withApiKey } from "@/lib/api/protect";
import { parseRegion } from "@/lib/api/params";
import { fetchUserSnapshots } from "@/server/queries/snapshots";

export const GET = withApiKey(["snapshot:all:metadata:read"], async (req: NextRequest, key) => {
  const region = parseRegion(req.nextUrl.searchParams);
  if (region instanceof Response) return region;

  const snapshots = await fetchUserSnapshots(key.userId, region);

  return Response.json({
    snapshots: snapshots.map((s) => ({
      id: s.id,
      fetchedAt: s.fetchedAt.toISOString(),
      rating: s.rating,
      displayName: s.displayName,
      gameVersion: s.gameVersion,
      courseRankUrl: s.courseRankUrl,
      classRankUrl: s.classRankUrl,
      stars: s.stars,
      versionPlayCount: s.versionPlayCount,
      totalPlayCount: s.totalPlayCount,
    })),
  });
});
