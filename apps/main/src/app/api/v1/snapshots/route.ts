import { type NextRequest } from "next/server";
import { withApiKey } from "@/lib/api/protect";
import { parseQuery } from "@/lib/api/parse-query";
import { zodJson } from "@/lib/api/zod-response";
import { fetchUserSnapshots } from "@/server/queries/snapshots";
import { spec } from "./spec";

export const GET = withApiKey(["snapshot:all:metadata:read"], async (req: NextRequest, key) => {
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region } = parsed;

  const snapshots = await fetchUserSnapshots(key.userId, region);

  return zodJson(spec.response, {
    snapshots: snapshots.map((s) => ({
      id: s.id,
      fetchedAt: s.fetchedAt.toISOString(),
      rating: s.rating,
      displayName: s.displayName,
      gameVersion: s.gameVersion,
      courseRankUrl: s.courseRankUrl,
      classRankUrl: s.classRankUrl,
      stars: s.stars,
      versionPlayCount: s.versionPlayCount,
      totalPlayCount: s.totalPlayCount,
    })),
  });
});
