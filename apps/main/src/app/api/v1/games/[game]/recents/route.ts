import { defineGameHandler, keyHasScope } from "@/lib/api/protect";
import { fetchRecentSongs } from "@/server/queries/recents";
import { spec } from "./spec";

export const GET = defineGameHandler(spec, async ({ game, key, query }) => {
  const { region, limit = 50, offset = 0 } = query;
  const withPlaylog = keyHasScope(key, "recent:detailed:read");

  const { recentPlays, totalCount, hasMore } = await fetchRecentSongs(game, key.userId, region, limit, offset);

  const plays = recentPlays.map((p) => ({
    playedAt: p.playedAt.toISOString(),
    scoreValue: p.scoreValue,
    secondaryScore: p.secondaryScore,
    comboStatus: p.comboStatus,
    syncStatus: p.syncStatus,
    clearStatus: p.clearStatus,
    track: p.track,
    song: {
      songId: p.songId,
      songName: p.songName,
      artist: p.artist,
      cover: p.cover,
      difficulty: p.difficultyCode,
      level: p.level,
      levelPrecise: p.levelPrecise,
      type: p.typeCode,
      genre: p.genre,
    },
    details: withPlaylog ? p.details : { ...p.details, playlog: null },
  }));

  return { plays, totalCount, hasMore };
});
