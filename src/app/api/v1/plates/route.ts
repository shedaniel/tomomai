import { type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userSnapshots } from "@/lib/db/schema-pg";
import { withApiKey } from "@/lib/api/protect";
import { parseQuery } from "@/lib/api/parse-query";
import { zodJson } from "@/lib/api/zod-response";
import { fetchPlateSongs } from "@/server/queries/plates";
import { spec } from "./spec";

export const GET = withApiKey(["plate:read"], async (req: NextRequest, key) => {
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region, version, difficulty, plateType } = parsed;

  const snapshot = await db
    .select({ id: userSnapshots.id, gameVersion: userSnapshots.gameVersion })
    .from(userSnapshots)
    .where(
      and(
        eq(userSnapshots.userId, key.userId),
        eq(userSnapshots.region, region),
      ),
    )
    .orderBy(desc(userSnapshots.fetchedAt))
    .limit(1);

  if (snapshot.length === 0) {
    return zodJson(spec.response, { songs: [] });
  }

  const songs = await fetchPlateSongs(
    snapshot[0].id,
    snapshot[0].gameVersion,
    region,
    version,
    difficulty,
    plateType,
  );

  return zodJson(spec.response, { songs });
});
