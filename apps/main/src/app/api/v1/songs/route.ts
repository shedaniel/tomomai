import { db } from "@/lib/db";
import { parentSong, songs } from "@/lib/db/schema-pg";
import { formatSongInstanceId } from "@tomomai/catalog/song-instance-id";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { zodJson } from "@/lib/api/zod-response";
import { spec } from "./spec";

async function getAllSongs() {
  return unstable_cache(
    async () => {
      return db
        .select({
          songId: parentSong.publicId,
          songName: parentSong.songName,
          artist: parentSong.artist,
          cover: parentSong.cover,
          type: parentSong.type,
          genre: parentSong.genre,
          difficulty: parentSong.difficulty,
          level: songs.level,
          levelPrecise: songs.levelPrecise,
          region: songs.region,
          gameVersion: songs.gameVersion,
          addedVersion: songs.addedVersion,
          bpm: parentSong.bpm,
          noteDesigner: songs.noteDesigner,
        })
        .from(songs)
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .orderBy(parentSong.songName, parentSong.difficulty);
    },
    ["api-v1-songs"],
    { revalidate: 3600, tags: ["api-v1-songs"] }
  )();
}

export async function GET() {
  const allSongs = await getAllSongs();
  return zodJson(spec.response, {
    songs: allSongs.map((s) => ({
      // Composite instance id: <parent nanoid>:<regionLetter><gameVersion>.
      // Unique per row; truncate at ':' for the chart-level id.
      songId: formatSongInstanceId(s.songId, s.region, s.gameVersion),
      songName: s.songName,
      artist: s.artist,
      cover: s.cover,
      type: s.type,
      genre: s.genre,
      difficulty: s.difficulty,
      level: s.level,
      levelPrecise: s.levelPrecise,
      region: s.region,
      gameVersion: s.gameVersion,
      addedVersion: s.addedVersion,
      bpm: s.bpm,
      noteDesigner: s.noteDesigner,
    })),
  });
}
