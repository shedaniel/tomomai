import type { ComponentType, ReactNode } from "react";
import type { CanonicalGameId } from "@/lib/games/ids";
import type { PercentileDistributionData } from "@/lib/games/maimai/percentile/types";
import type { GamePlayerScore } from "@/lib/games/player-view";
import type { FetchedRecentPlayDetails } from "@/lib/games/recent-details";
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

export type RecentDetailsProps<G extends CanonicalGameId = CanonicalGameId> = {
  details: FetchedRecentPlayDetails<G>;
  play: Pick<RecentPlay, "scoreValue" | "secondaryScore">;
};

/**
 * Pieces every game renders its own way, so shared cards never branch on the game.
 * A feature only some games have is a capability instead, checked with supportsGameFeature.
 */
export type GameUI<G extends CanonicalGameId> = {
  /** Wraps a score row or card with the game's hover details. */
  ScoreHover: ComponentType<ScoreHoverProps>;
  /** The fetched playlog of a recent play, shown when the row expands. */
  RecentDetails: ComponentType<RecentDetailsProps<G>>;
};

function PlainScore({ children }: ScoreHoverProps) {
  return <>{children}</>;
}

export const GAME_UI: { [G in CanonicalGameId]: GameUI<G> } = {
  maimai: { ScoreHover: SongHoverCard, RecentDetails: MaimaiRecentPlayDetails },
  chunithm: { ScoreHover: PlainScore, RecentDetails: ChunithmRecentPlayDetails },
};

/** Renders a fetched playlog with its game's panel. */
export function RecentPlaylog<G extends CanonicalGameId>({ details, play }: RecentDetailsProps<G>) {
  const { RecentDetails } = GAME_UI[details.game];
  return <RecentDetails details={details} play={play} />;
}
