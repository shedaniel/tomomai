import { type NextRequest } from "next/server";
import { withApiKey } from "@/lib/api/protect";
import { parseQuery } from "@/lib/api/parse-query";
import { parseParams } from "@/lib/api/parse-params";
import { zodJson } from "@/lib/api/zod-response";
import { buildSnapshotPayload } from "@/lib/api/snapshot-response";
import { fetchLatestSnapshotData } from "@/server/queries/snapshots";
import { spec } from "./spec";

export const GET = withApiKey(["snapshot:latest:metadata:read"], async (req: NextRequest, key, ctx) => {
  const params = await parseParams(ctx.params, spec.params!);
  if (params instanceof Response) return params;
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region } = parsed;

  const data = await fetchLatestSnapshotData(key.userId, region);
  if (!data) {
    return Response.json({ error: "No snapshot found for this region" }, { status: 404 });
  }
  return zodJson(spec.response, buildSnapshotPayload(data, key, "latest"));
});
