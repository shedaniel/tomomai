import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { parentSong, songs } from "@/lib/db/schema-pg";
import { eq } from "drizzle-orm";
import { zodJson } from "@/lib/api/zod-response";
import { spec } from "./spec";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: songId } = await params;

  const charts = await db
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
      tapCount: songs.tapCount,
      holdCount: songs.holdCount,
      slideCount: songs.slideCount,
      touchCount: songs.touchCount,
      breakCount: songs.breakCount,
    })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(eq(parentSong.publicId, songId));

  if (charts.length === 0) {
    return Response.json({ error: "Song not found" }, { status: 404 });
  }

  const first = charts[0];

  return zodJson(spec.response, {
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
  });
}
