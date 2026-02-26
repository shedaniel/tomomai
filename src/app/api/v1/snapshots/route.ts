import { type NextRequest } from "next/server";
import { withApiKey } from "@/lib/api/protect";
import { fetchUserSnapshots } from "@/server/queries/snapshots";
import { getEnabledRegions } from "@/lib/enabled-regions";
import type { Region } from "@/lib/types";

export const GET = withApiKey(["snapshot:all:metadata:read"], async (req: NextRequest, key) => {
  const region = req.nextUrl.searchParams.get("region") as Region | null;
  const enabledRegions = getEnabledRegions();

  if (!region || !enabledRegions.includes(region)) {
    return Response.json(
      { error: `Missing or invalid ?region= parameter. Valid values: ${enabledRegions.join(", ")}` },
      { status: 400 }
    );
  }

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
