import { type NextRequest } from "next/server";
import { withApiKey } from "@/lib/api/protect";
import { fetchPlayerStats } from "@/server/queries/stats";
import { getEnabledRegions } from "@/lib/enabled-regions";
import type { Region } from "@/lib/types";

export const GET = withApiKey(["stats:read"], async (req: NextRequest, key) => {
  const region = req.nextUrl.searchParams.get("region") as Region | null;
  const enabledRegions = getEnabledRegions();

  if (!region || !enabledRegions.includes(region)) {
    return Response.json(
      { error: `Missing or invalid ?region= parameter. Valid values: ${enabledRegions.join(", ")}` },
      { status: 400 }
    );
  }

  const { stats, totalSongs } = await fetchPlayerStats(key.userId, region);

  return Response.json({ stats, totalSongs });
});
