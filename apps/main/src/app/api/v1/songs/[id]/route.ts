import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { parentSong, songs } from "@/lib/db/schema-pg";
import { formatSongInstanceId, parseSongId } from "@/lib/catalog/song-instance-id";
import { and, desc, eq, sql } from "drizzle-orm";
import { zodJson } from "@/lib/api/zod-response";
import { spec } from "./spec";
import { unstable_cache } from "next/cache";
import { SONG_CATALOG_CACHE_HEADERS } from "../cache-headers";

const getSongById = unstable_cache(async (songId: string) => {
  const parsed = parseSongId(songId);
  if (!parsed) return [];
  const instanceFilter = parsed.kind === "instance"
    ? and(eq(songs.region, parsed.region), eq(songs.gameVersion, parsed.gameVersion))
    : undefined;

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
      tapCount: songs.tapCount,
      holdCount: songs.holdCount,
      slideCount: songs.slideCount,
      touchCount: songs.touchCount,
      breakCount: songs.breakCount,
    })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(eq(parentSong.publicId, parsed.parentPublicId), instanceFilter))
    .orderBy(desc(songs.gameVersion), sql`case when ${songs.region} = 'jp' then 0 else 1 end`, songs.region)
    .limit(1);

}, ["api-v1-parent-song-by-id"], { revalidate: 3600, tags: ["api-v1-songs"] });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseSongId(id)) return Response.json({ error: "Invalid song ID" }, { status: 400 });
  const charts = await getSongById(id);

  if (charts.length === 0) {
    return Response.json({ error: "Song not found" }, { status: 404 });
  }

  const first = charts[0];

  return zodJson(spec.response, {
    songId: formatSongInstanceId(first.songId, first.region, first.gameVersion),
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
  }, { headers: SONG_CATALOG_CACHE_HEADERS });
}
