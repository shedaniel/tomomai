import { useMemo } from "react";
import { createSearchIndex, parseSearchQuery, searchIndex, type SearchField, type SearchHit } from "@tomomai/utils/search";
import type { UniqueSong } from "@/components/db/songs/types";
import { codeOf, keyOf } from "@/lib/games/codes";
import type { CanonicalGameId } from "@/lib/games/ids";
import { getGameChartType, getGameDifficulty } from "@/lib/games/presentation";
import { getVersion } from "@/lib/games/versions";

/** Every name a difficulty answers to: its label, its short label and its key, such as "MASTER", "MAS" and "master". */
export function difficultyNames(game: CanonicalGameId, code: number): string[] {
  const { label, shortLabel } = getGameDifficulty(game, code);
  return [label, shortLabel, keyOf(game, "difficulty", code)];
}

/** A chart's level as players type it: the displayed level ("13+") and the constant ("13.7"). */
export function levelNames(level: string | null | undefined, levelPrecise: number | null | undefined): string[] {
  return [level ?? "", levelPrecise ? (levelPrecise / 10).toFixed(1) : ""].filter(Boolean);
}

/** How a catalog song is searched: its title, artist, readings, genre, version, charts and their levels. */
export function catalogSongFields(game: CanonicalGameId): SearchField<UniqueSong>[] {
  return [
    { get: song => song.songName, weight: 3 },
    { get: song => song.aliases, weight: 2 },
    { get: song => song.artist, weight: 2 },
    { get: song => song.genre },
    { get: song => getVersion(game, song.addedVersion)?.name },
    { get: song => getGameChartType(game, codeOf(game, "chartType", song.type)).label },
    { get: song => song.difficulties.flatMap(chart => difficultyNames(game, codeOf(game, "difficulty", chart.difficulty))) },
    { get: song => song.difficulties.map(chart => chart.noteDesigner) },
    { get: song => song.difficulties.flatMap(chart => levelNames(chart.level, chart.levelPrecise)), literal: true },
  ];
}

/** Ranks `items` by `query` with an index built once per item list, or returns null when there is no query. */
export function useSearch<T>(items: readonly T[] | null | undefined, fields: readonly SearchField<T>[], query: string): SearchHit<T>[] | null {
  const index = useMemo(() => items ? createSearchIndex(items, fields) : null, [items, fields]);
  return useMemo(() => {
    const tokens = parseSearchQuery(query);
    if (!index || tokens.length === 0) return null;
    return searchIndex(index, tokens);
  }, [index, query]);
}

/** Catalog songs by parent ID, so lists of scores can be searched by the song's readings and displayed levels. */
export function catalogByParentId(songs: readonly UniqueSong[] | null | undefined): Map<string, UniqueSong> {
  const byParent = new Map<string, UniqueSong>();
  for (const song of songs ?? []) {
    for (const parentId of song.parentIds) byParent.set(parentId, song);
  }
  return byParent;
}
