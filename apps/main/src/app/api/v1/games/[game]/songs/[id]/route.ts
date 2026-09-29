import type { CanonicalGameId } from "@/lib/games/types";
import { db } from "@/lib/db";
import { parentSong, songs } from "@/lib/db/schema-pg";
import { formatSongInstanceId, parseSongId } from "@/lib/catalog/song-instance-id";
import { and, desc, eq, sql } from "drizzle-orm";
import { definePublicGameHandler } from "@/lib/api/route";
import { spec } from "./spec";
import { unstable_cache } from "next/cache";

const getSongById = (game: CanonicalGameId, songId: string) => unstable_cache(async () => {
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
      metadata: songs.metadata,
      tapCount: songs.tapCount,
      holdCount: songs.holdCount,
      slideCount: songs.slideCount,
      touchCount: songs.touchCount,
      breakCount: songs.breakCount,
    })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(eq(songs.game, game), eq(parentSong.game, game), eq(parentSong.publicId, parsed.parentPublicId), instanceFilter))
    .orderBy(desc(songs.gameVersion), sql`case when ${songs.region} = 'jp' then 0 else 1 end`, songs.region)
    .limit(1);

}, ["api-v1-parent-song-by-id", game, songId], { revalidate: 3600, tags: [`api-v1-songs:${game}`] })();

export const GET = definePublicGameHandler(spec, async ({ game, params }) => {
  const charts = await getSongById(game, params.id);

  if (charts.length === 0) {
    return Response.json({ error: "Song not found" }, { status: 404 });
  }

  const first = charts[0];

  return {
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
    metadata: first.metadata,
    noteCounts: {
      tap: first.tapCount,
      hold: first.holdCount,
      slide: first.slideCount,
      touch: first.touchCount,
      break: first.breakCount,
    },
  };
});
