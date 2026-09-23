import { type NextRequest } from "next/server";
import { withGameApiKey as withApiKey } from "@/lib/api/game-protect";
import { parseQuery } from "@/lib/api/parse-query";
import { zodJson } from "@/lib/api/zod-response";
import { getScoreFetchStatus } from "@/server/services/games/score-ingestion";
import { spec } from "./spec";

export const GET = withApiKey(["fetch:read"], async (req: NextRequest, key) => {
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region } = parsed;

  const status = await getScoreFetchStatus({ userId: key.userId, game: key.game, region });
  if (!status) {
    return Response.json({ error: "No fetch session found for this region" }, { status: 404 });
  }
  return zodJson(spec.response, { game: key.game,
    id: status.id,
    status: status.status,
    startedAt: status.startedAt.toISOString(),
    completedAt: status.completedAt ? status.completedAt.toISOString() : null,
    errorMessage: status.errorMessage,
    statusStates: status.statusStates,
    notFoundScores: status.notFoundScores,
  });
});
