import { db } from "@/lib/db";
import { songs } from "@/lib/db/schema-pg";
import { songCatalogue } from "@/lib/api/schemas";
import { putR2Object } from "@/lib/r2";

const SONG_CATALOG_R2_KEY = "api/v1/songs";

/**
 * Rebuilds the public catalog from committed rows, validates its public API
 * contract once, serializes it once, then atomically replaces the stable R2
 * object. Callers must await failures before reporting an update as complete.
 */
export async function publishSongCatalog(): Promise<{ songCount: number; bytes: number }> {
  const catalog = {
    songs: await db
      .select({
        songId: songs.publicId,
        songName: songs.songName,
        artist: songs.artist,
        cover: songs.cover,
        type: songs.type,
        genre: songs.genre,
        difficulty: songs.difficulty,
        level: songs.level,
        levelPrecise: songs.levelPrecise,
        region: songs.region,
        gameVersion: songs.gameVersion,
        addedVersion: songs.addedVersion,
        bpm: songs.bpm,
        noteDesigner: songs.noteDesigner,
      })
      .from(songs)
      .orderBy(songs.songName, songs.difficulty),
  };

  const validation = songCatalogue.safeParse(catalog);
  if (!validation.success) {
    throw new Error(`Public song catalog validation failed: ${validation.error.message}`);
  }

  const body = JSON.stringify(catalog);
  await putR2Object({
    key: SONG_CATALOG_R2_KEY,
    body,
    contentType: "application/json; charset=utf-8",
    cacheControl: "public, max-age=3600",
  });
  return { songCount: catalog.songs.length, bytes: Buffer.byteLength(body) };
}
