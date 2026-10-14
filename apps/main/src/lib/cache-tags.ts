import type { CanonicalGameId } from "@/lib/games/ids";

/** Data cache tags of a game's catalog readers. Catalog writes invalidate them through `revalidateCatalog`. */
export function catalogTags(game: CanonicalGameId) {
  return {
    uniqueSongs: `all-unique-songs:${game}`,
    apiSongs: `api-v1-songs:${game}`,
    reservedSongs: `reserved-songs:${game}`,
  } as const;
}
