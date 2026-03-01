import { type NextRequest } from "next/server";
import { withApiKey } from "@/lib/api/protect";
import { parseRegion } from "@/lib/api/params";
import { buildSnapshotResponse } from "@/lib/api/snapshot-response";
import { fetchSnapshotData } from "@/server/queries/snapshots";

export const GET = withApiKey(
  ["snapshot:all:metadata:read"],
  async (req: NextRequest, key) => {
    const region = parseRegion(req.nextUrl.searchParams);
    if (region instanceof Response) return region;

    const snapshotId = req.nextUrl.pathname.split("/").pop()!;
    const data = await fetchSnapshotData(key.userId, snapshotId, region);

    if (!data) {
      return Response.json({ error: "Snapshot not found" }, { status: 404 });
    }

    return buildSnapshotResponse(data, key, "all");
  }
);
