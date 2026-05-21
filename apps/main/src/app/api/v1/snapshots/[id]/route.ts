import { type NextRequest } from "next/server";
import { withApiKey } from "@/lib/api/protect";
import { parseQuery } from "@/lib/api/parse-query";
import { parseParams } from "@/lib/api/parse-params";
import { zodJson } from "@/lib/api/zod-response";
import { buildSnapshotPayload } from "@/lib/api/snapshot-response";
import { deleteUserSnapshot, fetchSnapshotData } from "@/server/queries/snapshots";
import { deleteSpec, spec } from "./spec";

export const GET = withApiKey(
  ["snapshot:all:metadata:read"],
  async (req: NextRequest, key, ctx) => {
    const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
    if (parsed instanceof Response) return parsed;
    const params = await parseParams(ctx.params, spec.params!);
    if (params instanceof Response) return params;
    const { region } = parsed;
    const { id } = params as { id: string };

    const data = await fetchSnapshotData(key.userId, id, region);
    if (!data) {
      return Response.json({ error: "Snapshot not found" }, { status: 404 });
    }
    return zodJson(spec.response, buildSnapshotPayload(data, key, "all"));
  }
);

export const DELETE = withApiKey(
  ["snapshot:all:delete"],
  async (req: NextRequest, key, ctx) => {
    const parsed = parseQuery(req.nextUrl.searchParams, deleteSpec.query!);
    if (parsed instanceof Response) return parsed;
    const params = await parseParams(ctx.params, deleteSpec.params!);
    if (params instanceof Response) return params;
    const { region } = parsed;
    const { id } = params as { id: string };

    const { deleted } = await deleteUserSnapshot(key.userId, id, region);
    if (!deleted) {
      return Response.json({ error: "Snapshot not found" }, { status: 404 });
    }
    return zodJson(deleteSpec.response, { success: true });
  }
);
