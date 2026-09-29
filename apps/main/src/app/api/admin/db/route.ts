import { adminRoute } from "@/lib/api/admin-route";
import { AdminRequestError, requireAdminCatalogVersion, requireAdminRegion } from "@/server/services/catalog/admin-game";
import type { CanonicalGameId } from "@/lib/games/types";
import { db } from "@/lib/db";
import { getCurrentVersion } from "@/lib/games/versions";
import { normalizeName } from "@/lib/name-utils";
import { songs, parentSong } from "@/lib/db/schema-pg";
import { and, eq, inArray } from "drizzle-orm";
import { publishSongCatalog } from "@/server/services/catalog/publication";
import { lockCatalogWrites } from "@/server/services/catalog/ingestion/lock";
import { revalidatePath, revalidateTag } from "next/cache";
import { locales } from "@tomomai/i18n/locale";
import type { Logger } from "pino";

export const GET = adminRoute("admin/db", async ({ request, game, log }) => {
  const type = request.nextUrl.searchParams.get("type") || "normalize";
  if (type !== "normalize") throw new AdminRequestError("Invalid 'type' parameter. Must be 'normalize'");
  return normalize(game, request.nextUrl.searchParams, log);
}, { game: "write" });

async function normalize(game: CanonicalGameId, searchParams: URLSearchParams, log: Logger) {
  const region = requireAdminRegion(game, searchParams);
  const version = searchParams.get("version");
  const currentVersion = version === null ? getCurrentVersion(game, region) : requireAdminCatalogVersion(game, region, version);

  const totalMasterNamesNormalized = await db.transaction(async (tx) => {
    await lockCatalogWrites(tx);
    const selected = await tx.selectDistinct({ parentId: songs.parentId }).from(songs)
      .where(and(eq(songs.game, game), eq(songs.region, region), eq(songs.gameVersion, currentVersion)));
    if (selected.length === 0) return 0;
    const parents = await tx.select().from(parentSong)
      .where(inArray(parentSong.id, selected.map(song => song.parentId)))
      .orderBy(parentSong.id);
    let updated = 0;
    for (const parent of parents) {
      const songName = normalizeName(parent.songName);
      if (songName === parent.songName) continue;
      const collisions = await tx.select({ disambiguator: parentSong.disambiguator }).from(parentSong)
        .where(and(eq(parentSong.game, game), eq(parentSong.songName, songName), eq(parentSong.type, parent.type), eq(parentSong.difficulty, parent.difficulty)));
      const occupied = new Set(collisions.map(row => row.disambiguator));
      let disambiguator = parent.disambiguator;
      // Normalizing a title is insufficient evidence to merge chart identities.
      if (occupied.has(disambiguator)) disambiguator = Math.max(...occupied) + 1;
      await tx.update(parentSong).set({ songName, disambiguator }).where(eq(parentSong.id, parent.id));
      updated++;
    }
    return updated;
  });

  await publishSongCatalog(game);
  revalidateTag(`all-unique-songs:${game}`, { expire: 3600 });
  revalidateTag(`reserved-songs:${game}`, { expire: 0 });
  revalidateTag(`api-v1-songs:${game}`, { expire: 0 });
  for (const locale of locales) {
    revalidatePath(`/${locale}/db/songs/[slug]`, "page");
    revalidatePath(`/${locale}/db/songs`, "page");
  }
  revalidatePath("/sitemap.xml", "page");
  log.info({ totalMasterNamesNormalized }, "Parent song names normalized");
  return Response.json({
    success: true,
    message: "Song data normalization completed",
    statistics: { totalDuplicatesMerged: 0, totalMasterNamesNormalized },
  });
}
