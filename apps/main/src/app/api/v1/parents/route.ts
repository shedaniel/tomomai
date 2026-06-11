import { db } from "@/lib/db";
import { parentSong } from "@/lib/db/schema-pg";
import { unstable_cache } from "next/cache";
import { zodJson } from "@/lib/api/zod-response";
import { spec } from "./spec";

async function getAllParents() {
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
          bpm: parentSong.bpm,
          disambiguator: parentSong.disambiguator,
        })
        .from(parentSong)
        .orderBy(parentSong.songName, parentSong.difficulty);
    },
    ["api-v1-parents"],
    { revalidate: 3600, tags: ["api-v1-songs"] }
  )();
}

export async function GET() {
  const parents = await getAllParents();
  return zodJson(spec.response, { parents });
}
