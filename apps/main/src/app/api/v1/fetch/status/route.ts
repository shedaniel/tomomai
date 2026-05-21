import { type NextRequest } from "next/server";
import { withApiKey } from "@/lib/api/protect";
import { parseQuery } from "@/lib/api/parse-query";
import { zodJson } from "@/lib/api/zod-response";
import { getFetchStatusServer } from "@/lib/maimai-server-actions";
import { spec } from "./spec";

export const GET = withApiKey(["fetch:read"], async (req: NextRequest, key) => {
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region } = parsed;

  const status = await getFetchStatusServer(key.userId, region);
  if (!status) {
    return Response.json({ error: "No fetch session found for this region" }, { status: 404 });
  }
  return zodJson(spec.response, {
    id: status.id,
    status: status.status,
    startedAt: status.startedAt.toISOString(),
    completedAt: status.completedAt ? status.completedAt.toISOString() : null,
    errorMessage: status.errorMessage,
    statusStates: status.statusStates,
    notFoundScores: status.notFoundScores,
  });
});
