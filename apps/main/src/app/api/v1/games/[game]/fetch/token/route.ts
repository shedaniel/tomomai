import { defineGameHandler } from "@/lib/api/protect";
import { parseBody } from "@/lib/api/parse-input";
import { getGame } from "@/lib/games/registry";
import { formatSegaCookie } from "@/lib/games/token-format";
import { deleteToken, saveToken } from "@/server/services/games/tokens";
import { COOKIE_SIGN_IN_UNSUPPORTED, putBody, putSpec, spec } from "./spec";

export const DELETE = defineGameHandler(spec, async ({ game, key, query }) => {
  await deleteToken(game, key.userId, query.region);
  return { success: true } as const;
});

export const PUT = defineGameHandler(putSpec, async ({ req, game, key, query }) => {
  const body = await parseBody(req, putBody);
  if (body instanceof Response) return body;
  if (!getGame(game).loginMethods[query.region]?.includes("sega-cookie")) {
    return Response.json(
      { error: "This region does not sign in with a SEGA cookie", code: COOKIE_SIGN_IN_UNSUPPORTED },
      { status: 422 },
    );
  }
  await saveToken(game, key.userId, query.region, formatSegaCookie(body.clal));
  return { success: true } as const;
});
