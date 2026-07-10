import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { songs } from "@/lib/db/schema-pg";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { zodJson } from "@/lib/api/zod-response";
import { spec } from "./spec";
import { SONG_CATALOG_CACHE_HEADERS } from "../cache-headers";

async function getSongById(songId: string) {
  return unstable_cache(
    async (id: string) => {
      const charts = await db
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
          tapCount: songs.tapCount,
          holdCount: songs.holdCount,
          slideCount: songs.slideCount,
          touchCount: songs.touchCount,
          breakCount: songs.breakCount,
        })
        .from(songs)
        .where(eq(songs.publicId, id));
      return charts;
    },
    ["api-v1-songs-by-id"],
    { revalidate: 3600, tags: ["api-v1-songs"] }
  )(songId);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: songId } = await params;

  if (!/^[A-Za-z0-9_-]{21}$/.test(songId)) {
    return Response.json({ error: "Song not found" }, { status: 404 });
  }

  const charts = await getSongById(songId);

  if (charts.length === 0) {
    return Response.json({ error: "Song not found" }, { status: 404 });
  }

  const first = charts[0];

  return zodJson(
    spec.response,
    {
      songId: first.songId,
      songName: first.songName,
      artist: first.artist,
      cover: first.cover,
      type: first.type,
      genre: first.genre,
      bpm: first.bpm,
      region: first.region,
      gameVersion: first.gameVersion,
      addedVersion: first.addedVersion,
      difficulty: first.difficulty,
      level: first.level,
      levelPrecise: first.levelPrecise,
      noteDesigner: first.noteDesigner,
      noteCounts: {
        tap: first.tapCount,
        hold: first.holdCount,
        slide: first.slideCount,
        touch: first.touchCount,
        break: first.breakCount,
      },
    },
    {
      headers: SONG_CATALOG_CACHE_HEADERS,
    },
  );
}
