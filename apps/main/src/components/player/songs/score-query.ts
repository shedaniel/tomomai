import type { SearchField } from "@tomomai/utils/search";
import { parentPublicIdOf } from "@tomomai/games/song-ids";
import type { UniqueSong } from "@/components/db/songs/types";
import { keyOf } from "@/lib/games/codes";
import type { CanonicalGameId } from "@/lib/games/ids";
import { getGameChartType } from "@/lib/games/presentation";
import { difficultyNames, levelNames } from "@/lib/search/song-search";
import type { DisplayScore } from "./types";

type SearchedScore = Pick<DisplayScore, "songId" | "songName" | "artist" | "difficultyCode" | "typeCode" | "levelPrecise">;

/**
 * How a player's score is searched: title, artist, the song's readings and displayed level from the catalog
 * when it has loaded, chart type, difficulty and level.
 */
export function scoreSearchFields(game: CanonicalGameId, catalog: ReadonlyMap<string, UniqueSong>): SearchField<SearchedScore>[] {
  const song = (score: SearchedScore) => catalog.get(parentPublicIdOf(score.songId));
  const chart = (score: SearchedScore) => {
    const key = keyOf(game, "difficulty", score.difficultyCode);
    return song(score)?.difficulties.find(difficulty => difficulty.difficulty === key);
  };
  return [
    { get: score => score.songName, weight: 3 },
    { get: score => song(score)?.aliases, weight: 2 },
    { get: score => score.artist, weight: 2 },
    { get: score => difficultyNames(game, score.difficultyCode) },
    { get: score => getGameChartType(game, score.typeCode).label },
    { get: score => levelNames(chart(score)?.level, score.levelPrecise), literal: true },
  ];
}
