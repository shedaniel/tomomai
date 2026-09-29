"use client";

import { useGameId } from "@/components/providers/game-provider";
import { SongHoverCard } from "@/components/games/maimai/song-hover-card";
import { codeToDifficulty, codeToChartType } from "@/lib/games/maimai/codes";
import type { PercentileEntry } from "@/lib/games/maimai/percentile/types";
import type { DisplayScore } from "./types";

export function ScoreHover({ song, children, ...props }: { song: DisplayScore; children: React.ReactNode; side?: "right"; percentile?: PercentileEntry & { userAchievement: number } }) {
  const game = useGameId();
  return game === "maimai" ? <SongHoverCard song={{ ...song, difficulty: codeToDifficulty(song.difficultyCode), type: codeToChartType(song.typeCode) }} {...props}>{children}</SongHoverCard> : <>{children}</>;
}
