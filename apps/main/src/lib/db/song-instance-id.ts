import { and, eq, sql } from "drizzle-orm";
import type { ParsedSongId } from "@tomomai/games/song-ids";
import type { CanonicalGameId } from "@/lib/games/ids";
import { parentSong, songs } from "./schema-pg";

export const songInstanceId = sql<string>`${parentSong.publicId} || ':' || CASE ${songs.region} WHEN 'jp' THEN 'j' WHEN 'intl' THEN 'i' WHEN 'cn' THEN 'c' END || ${songs.gameVersion}::text`;

/** The game's charts a song ID names: every instance of a parent ID, or the one instance of an instance ID. */
export function songIdFilter(game: CanonicalGameId, parsed: ParsedSongId) {
  return and(
    eq(parentSong.game, game),
    eq(parentSong.publicId, parsed.parentPublicId),
    ...(parsed.kind === "instance" ? [eq(songs.region, parsed.region), eq(songs.gameVersion, parsed.gameVersion)] : []),
  );
}
