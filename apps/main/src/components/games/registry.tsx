import type { ComponentType, ReactNode } from "react";
import type { CanonicalGameId } from "@/lib/games/ids";
import type { PercentileDistributionData } from "@/lib/games/maimai/percentile/types";
import type { GamePlayerScore } from "@/lib/games/player-view";
import type { RecentPlay } from "@/lib/trpc-types";
import { ChunithmRecentPlayDetails } from "./chunithm/recent-play-details";
import { MaimaiRecentPlayDetails } from "./maimai/recent-play-details";
import { SongHoverCard } from "./maimai/song-hover-card";

export type ScoreHoverProps = {
  score: Pick<GamePlayerScore, "songId" | "songName" | "artist" | "cover" | "difficultyCode" | "typeCode">;
  children: ReactNode;
  side?: "right";
  percentile?: PercentileDistributionData;
};

export type RecentDetailsProps = {
  play: RecentPlay;
  isExpanded: boolean;
  isDetailed: boolean;
};

/**
 * Pieces every game renders its own way, so shared cards never branch on the game.
 * A feature only some games have is a capability instead, checked with supportsGameFeature.
 */
export type GameUI = {
  /** Wraps a score row or card with the game's hover details. */
  ScoreHover: ComponentType<ScoreHoverProps>;
  /** The expandable panel under a recent play. */
  RecentDetails: ComponentType<RecentDetailsProps>;
};

function PlainScore({ children }: ScoreHoverProps) {
  return <>{children}</>;
}

export const GAME_UI: Record<CanonicalGameId, GameUI> = {
  maimai: { ScoreHover: SongHoverCard, RecentDetails: MaimaiRecentPlayDetails },
  chunithm: { ScoreHover: PlainScore, RecentDetails: ChunithmRecentPlayDetails },
};
