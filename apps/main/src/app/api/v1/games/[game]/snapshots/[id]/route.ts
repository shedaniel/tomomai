import { defineGameHandler } from "@/lib/api/protect";
import { buildSnapshotPayload } from "@/lib/api/snapshot-response";
import { deleteUserSnapshot, fetchSnapshotData } from "@/server/queries/snapshots";
import { deleteSpec, spec } from "./spec";

export const GET = defineGameHandler(spec, async ({ game, key, params, query }) => {
  const data = await fetchSnapshotData(game, key.userId, params.id, query.region);
  if (!data) {
    return Response.json({ error: "Snapshot not found" }, { status: 404 });
  }
  return buildSnapshotPayload(data, key, "all");
});

export const DELETE = defineGameHandler(deleteSpec, async ({ game, key, params, query }) => {
  const { deleted } = await deleteUserSnapshot(game, key.userId, params.id, query.region);
  if (!deleted) {
    return Response.json({ error: "Snapshot not found" }, { status: 404 });
  }
  return { success: true } as const;
});
