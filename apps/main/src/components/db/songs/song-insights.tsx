"use client";

import { createContext, useContext } from "react";
import type { Region } from "@/lib/games/ids";
import type { RatingStanding } from "@/lib/games/rating-standing";
import type { ScoreHistoryPoint } from "./score-history-chart";
import type { SongExtendedIdentified, UserScore } from "./types";

/** What the song details know about the viewer beyond their best scores, shared by its rows and chart dialogs. */
export type SongInsights = {
  standings: Partial<Record<Region, RatingStanding>>;
  history: Partial<Record<Region, Record<string, ScoreHistoryPoint[]>>>;
  regionCharts: Partial<Record<Region, { chart: SongExtendedIdentified; score?: UserScore }[]>>;
};

export const SongInsightsContext = createContext<SongInsights | null>(null);

export function useSongInsights(): SongInsights | null {
  return useContext(SongInsightsContext);
}

const MONTH = 30 * 24 * 60 * 60 * 1000;

/** The score a month ago, when there is history from before then and the score has changed since. */
export function scoreMonthAgo(points: readonly ScoreHistoryPoint[] | undefined, now = Date.now()): ScoreHistoryPoint | null {
  if (!points || points.length < 2) return null;
  const before = points.filter(point => point.fetchedAt.getTime() <= now - MONTH).at(-1);
  const latest = points[points.length - 1];
  return before && before.scoreValue < latest.scoreValue ? before : null;
}
