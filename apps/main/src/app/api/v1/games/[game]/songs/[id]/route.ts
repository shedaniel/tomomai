import type { CanonicalGameId } from "@/lib/games/types";
import { db } from "@/lib/db";
import { parentSong, songs } from "@/lib/db/schema-pg";
import { chartEstimates } from "@/lib/catalog/chart-metadata";
import { formatSongInstanceId, parseSongId } from "@/lib/catalog/song-instance-id";
import { songIdFilter } from "@/lib/db/song-instance-id";
import { eq } from "drizzle-orm";
import { instancePreference } from "@/lib/games/regions";
import { maxBy } from "@/lib/utils";
import { definePublicGameHandler } from "@/lib/api/route";
import { GAME_API_DETAILS } from "@/lib/api/schemas";
import { spec } from "./spec";
import { unstable_cache } from "next/cache";
import { catalogTags } from "@/lib/cache-tags";

const getSongById = (game: CanonicalGameId, songId: string) => unstable_cache(async () => {
  const parsed = parseSongId(songId);
  if (!parsed) return [];

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
    .where(songIdFilter(game, parsed));
}, ["api-v1-parent-song-by-id", game, songId], { revalidate: 3600, tags: [catalogTags(game).apiSongs] })();

export const GET = definePublicGameHandler(spec, async ({ game, params }) => {
  const instance = maxBy(await getSongById(game, params.id), instancePreference);
  if (!instance) return Response.json({ error: "Song not found" }, { status: 404 });

  return {
    songId: formatSongInstanceId(instance.songId, instance.region, instance.gameVersion),
    songName: instance.songName,
    artist: instance.artist,
    cover: instance.cover,
    type: instance.type,
    genre: instance.genre,
    bpm: instance.bpm,
    region: instance.region,
    gameVersion: instance.gameVersion,
    addedVersion: instance.addedVersion,
    difficulty: instance.difficulty,
    level: instance.level,
    levelPrecise: instance.levelPrecise,
    noteDesigner: instance.noteDesigner,
    ...chartEstimates(instance.metadata),
    details: GAME_API_DETAILS[game].song(instance),
  };
});
