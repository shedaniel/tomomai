import { type NextRequest } from "next/server";
import { withGameApiKey as withApiKey } from "@/lib/api/game-protect";
import { parseQuery } from "@/lib/api/parse-query";
import { zodJson } from "@/lib/api/zod-response";
import { fetchLatestPlateSongs } from "@/server/services/games/maimai/plates";
import { spec } from "./spec";

export const GET = withApiKey(["plate:read"], async (req: NextRequest, key) => {
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region, ...query } = parsed;

  const scores = await fetchLatestPlateSongs(key.game, key.userId, region, query);
  const songs = scores.map(({ difficultyCode, typeCode, ...score }) => ({ ...score, difficulty: difficultyCode, type: typeCode }));

  return zodJson(spec.response, { game: key.game, songs });
});
