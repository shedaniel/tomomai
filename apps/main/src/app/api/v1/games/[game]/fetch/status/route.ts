import { defineGameHandler } from "@/lib/api/protect";
import { getScoreFetchStatus } from "@/server/services/games/fetch-sessions";
import { spec } from "./spec";

export const GET = defineGameHandler(spec, async ({ game, key, query }) => {
  const status = await getScoreFetchStatus({ userId: key.userId, game, region: query.region });
  if (!status) {
    return Response.json({ error: "No fetch session found for this region" }, { status: 404 });
  }
  return {
    id: status.id,
    status: status.status,
    startedAt: status.startedAt.toISOString(),
    completedAt: status.completedAt ? status.completedAt.toISOString() : null,
    errorMessage: status.errorMessage,
    statusStates: status.statusStates,
    notFoundScores: status.notFoundScores,
  };
});
