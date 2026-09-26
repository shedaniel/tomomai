import { type NextRequest } from "next/server";
import { withGameApiKey as withApiKey } from "@/lib/api/game-protect";
import { parseQuery } from "@/lib/api/parse-query";
import { zodJson } from "@/lib/api/zod-response";
import { deleteToken } from "@/server/services/games/tokens";
import { spec } from "./spec";

export const DELETE = withApiKey(["fetch:delete"], async (req: NextRequest, key) => {
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region } = parsed;

  await deleteToken(key.game, key.userId, region);
  return zodJson(spec.response, { game: key.game, success: true });
});
