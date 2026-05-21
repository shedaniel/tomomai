import { type NextRequest } from "next/server";
import { withApiKey } from "@/lib/api/protect";
import { parseQuery } from "@/lib/api/parse-query";
import { zodJson } from "@/lib/api/zod-response";
import { startFetchServer } from "@/lib/maimai-server-actions";
import { mapFetchStartError } from "@/lib/api/fetch-errors";
import { spec } from "./spec";

export const POST = withApiKey(["fetch:start"], async (req: NextRequest, key) => {
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region } = parsed;

  try {
    const result = await startFetchServer(key.userId, region, undefined, []);
    return zodJson(spec.response, {
      sessionId: result.sessionId,
      status: result.status,
    });
  } catch (err) {
    return mapFetchStartError(err);
  }
});
