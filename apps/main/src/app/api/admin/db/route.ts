import { adminRoute } from "@/lib/api/admin-route";
import { AdminRequestError, requireAdminCatalogVersion, requireAdminRegion } from "@/server/services/catalog/admin-game";
import type { CanonicalGameId } from "@/lib/games/types";
import { db } from "@/lib/db";
import { GameAdapterError } from "@/lib/games/errors";
import { getGame } from "@/lib/games/registry";
import { getCurrentVersion } from "@/lib/games/versions";
import { songs, parentSong } from "@/lib/db/schema-pg";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import { and, eq, inArray } from "drizzle-orm";
import { publishSongCatalog } from "@/server/services/catalog/publication";
import { lockCatalogWrites } from "@/server/services/catalog/ingestion/lock";
import { revalidateCatalog } from "@/server/services/catalog/revalidation";
import type { Logger } from "pino";

export const GET = adminRoute("admin/db", async ({ request, game, log }) => {
  const type = request.nextUrl.searchParams.get("type") || "normalize";
  if (type !== "normalize") throw new AdminRequestError("Invalid 'type' parameter. Must be 'normalize'");
  return normalize(game, request.nextUrl.searchParams, log);
}, { game: "write" });

async function normalize(game: CanonicalGameId, searchParams: URLSearchParams, log: Logger) {
  // Ingestion keeps a game's source titles unless it has a rule, so renaming them here would orphan the parents.
  const { normalizeTitle } = GAME_SERVER_MODULES[game].catalog;
  if (!normalizeTitle) {
    throw new GameAdapterError("UNSUPPORTED_CAPABILITY", `The ${getGame(game).brand.displayName} catalog keeps source titles and has no title normalization`, game);
  }
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
      const songName = normalizeTitle(parent.songName);
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
  await revalidateCatalog(game, { log });
  log.info({ totalMasterNamesNormalized }, "Parent song names normalized");
  return Response.json({
    success: true,
    message: "Song data normalization completed",
    statistics: { totalDuplicatesMerged: 0, totalMasterNamesNormalized },
  });
}
