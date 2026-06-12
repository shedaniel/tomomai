import { type NextRequest } from "next/server";
import { withApiKey } from "@/lib/api/protect";
import { parseQuery } from "@/lib/api/parse-query";
import { parseParams } from "@/lib/api/parse-params";
import { zodJson } from "@/lib/api/zod-response";
import { fetchPlayerStats } from "@/server/queries/stats";
import { spec } from "./spec";

export const GET = withApiKey(["stats:read"], async (req: NextRequest, key, ctx) => {
  const params = await parseParams(ctx.params, spec.params!);
  if (params instanceof Response) return params;
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region } = parsed;

  const { stats, totalSongs } = await fetchPlayerStats(key.userId, region);
  return zodJson(spec.response, { stats, totalSongs });
});
