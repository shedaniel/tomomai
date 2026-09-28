import { type NextRequest } from "next/server";
import { withGameApiKey as withApiKey } from "@/lib/api/game-protect";
import { parseQuery } from "@/lib/api/parse-query";
import { zodJson } from "@/lib/api/zod-response";
import { startScoreFetch } from "@/server/services/games/score-ingestion";
import { mapFetchStartError } from "@/lib/api/fetch-errors";
import { spec } from "./spec";

export const POST = withApiKey(["fetch:start"], async (req: NextRequest, key) => {
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region } = parsed;

  try {
    const result = await startScoreFetch({ userId: key.userId, game: key.game, region });
    return zodJson(spec.response, { game: key.game,
      sessionId: result.sessionId,
      status: result.status,
    });
  } catch (err) {
    return mapFetchStartError(err);
  }
});
