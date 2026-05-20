import { type NextRequest } from "next/server";
import { withApiKey } from "@/lib/api/protect";
import { parseQuery } from "@/lib/api/parse-query";
import { zodJson } from "@/lib/api/zod-response";
import { buildSnapshotPayload } from "@/lib/api/snapshot-response";
import { deleteUserSnapshot, fetchSnapshotData } from "@/server/queries/snapshots";
import { deleteSpec, spec } from "./spec";

export const GET = withApiKey(
  ["snapshot:all:metadata:read"],
  async (req: NextRequest, key) => {
    const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
    if (parsed instanceof Response) return parsed;
    const { region } = parsed;

    const snapshotId = req.nextUrl.pathname.split("/").pop()!;
    const data = await fetchSnapshotData(key.userId, snapshotId, region);
    if (!data) {
      return Response.json({ error: "Snapshot not found" }, { status: 404 });
    }
    return zodJson(spec.response, buildSnapshotPayload(data, key, "all"));
  }
);

export const DELETE = withApiKey(
  ["snapshot:all:delete"],
  async (req: NextRequest, key) => {
    const parsed = parseQuery(req.nextUrl.searchParams, deleteSpec.query!);
    if (parsed instanceof Response) return parsed;
    const { region } = parsed;

    const snapshotId = req.nextUrl.pathname.split("/").pop()!;
    const { deleted } = await deleteUserSnapshot(key.userId, snapshotId, region);
    if (!deleted) {
      return Response.json({ error: "Snapshot not found" }, { status: 404 });
    }
    return zodJson(deleteSpec.response, { success: true });
  }
);
