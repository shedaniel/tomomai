import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { songs } from "@/lib/db/schema-pg";
import { unstable_cache } from "next/cache";
import { parseParams } from "@/lib/api/parse-params";
import { zodJson } from "@/lib/api/zod-response";
import { type RouteContext } from "@/lib/api/protect";
import { spec } from "./spec";

async function getAllSongs(game: string) {
  return unstable_cache(
    async () => {
      return db
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
        .orderBy(songs.songName, songs.difficulty);
    },
    ["api-v1-songs", game],
    { revalidate: 3600, tags: ["api-v1-songs"] }
  )();
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const params = await parseParams(ctx.params, spec.params!);
  if (params instanceof Response) return params;
  const { game } = params as { game: string };

  const allSongs = await getAllSongs(game);
  return zodJson(spec.response, {
    songs: allSongs.map((s) => ({
      songId: s.songId,
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
