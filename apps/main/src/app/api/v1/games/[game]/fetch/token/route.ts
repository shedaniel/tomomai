import { type NextRequest } from "next/server";
import { withGameApiKey as withApiKey } from "@/lib/api/game-protect";
import { parseQuery } from "@/lib/api/parse-query";
import { zodJson } from "@/lib/api/zod-response";
import { db } from "@/lib/db";
import { userTokens } from "@/lib/db/schema-pg";
import { and, eq } from "drizzle-orm";
import { spec } from "./spec";

export const DELETE = withApiKey(["fetch:delete"], async (req: NextRequest, key) => {
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region } = parsed;

  await db.delete(userTokens).where(and(eq(userTokens.userId, key.userId), eq(userTokens.game, key.game), eq(userTokens.region, region)));
  return zodJson(spec.response, { game: key.game, success: true });
});
