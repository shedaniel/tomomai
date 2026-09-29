import { defineGameHandler, keyHasScope } from "@/lib/api/protect";
import { GAME_API_DETAILS } from "@/lib/api/schemas";
import { fetchRecentSongs } from "@/server/queries/recents";
import { spec } from "./spec";

export const GET = defineGameHandler(spec, async ({ game, key, query }) => {
  const { region, limit = 50, offset = 0 } = query;
  const withPlaylog = keyHasScope(key, "recent:detailed:read");
  const details = GAME_API_DETAILS[game];

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
    details: details.recent(p, withPlaylog),
  }));

  return { plays, totalCount, hasMore };
});
