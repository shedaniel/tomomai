import { type NextRequest } from "next/server";
import { withApiKey } from "@/lib/api/protect";
import { parseRegion } from "@/lib/api/params";
import { fetchPlayerStats } from "@/server/queries/stats";

export const GET = withApiKey(["stats:read"], async (req: NextRequest, key) => {
  const region = parseRegion(req.nextUrl.searchParams);
  if (region instanceof Response) return region;

  const { stats, totalSongs } = await fetchPlayerStats(key.userId, region);

  return Response.json({ stats, totalSongs });
});
