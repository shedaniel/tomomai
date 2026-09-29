import { defineGameHandler } from "@/lib/api/protect";
import { buildSnapshotPayload } from "@/lib/api/snapshot-response";
import { fetchLatestSnapshotData } from "@/server/queries/snapshots";
import { spec } from "./spec";

export const GET = defineGameHandler(spec, async ({ game, key, query }) => {
  const data = await fetchLatestSnapshotData(game, key.userId, query.region);
  if (!data) {
    return Response.json({ error: "No snapshot found for this region" }, { status: 404 });
  }
  return buildSnapshotPayload(data, key, "latest");
});
