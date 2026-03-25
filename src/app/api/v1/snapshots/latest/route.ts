import { type NextRequest } from "next/server";
import { withApiKey } from "@/lib/api/protect";
import { parseRegion } from "@/lib/api/params";
import { buildSnapshotResponse } from "@/lib/api/snapshot-response";
import { fetchLatestSnapshotData } from "@/server/queries/snapshots";

export const GET = withApiKey(["snapshot:latest:metadata:read"], async (req: NextRequest, key) => {
  const region = parseRegion(req.nextUrl.searchParams);
  if (region instanceof Response) return region;

  const data = await fetchLatestSnapshotData(key.userId, region);

  if (!data) {
    return Response.json({ error: "No snapshot found for this region" }, { status: 404 });
  }

  return buildSnapshotResponse(data, key, "latest");
});
