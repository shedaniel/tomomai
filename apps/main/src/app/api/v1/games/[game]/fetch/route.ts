import { defineGameHandler } from "@/lib/api/protect";
import { startScoreFetch } from "@/server/services/games/fetch-sessions";
import { mapFetchStartError } from "@/lib/api/fetch-errors";
import { spec } from "./spec";

export const POST = defineGameHandler(spec, async ({ game, key, query }) => {
  try {
    const { sessionId, status } = await startScoreFetch({ userId: key.userId, game, region: query.region });
    return { sessionId, status };
  } catch (err) {
    return mapFetchStartError(err);
  }
});
