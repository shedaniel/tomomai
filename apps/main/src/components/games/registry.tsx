import type { ComponentType, ReactNode } from "react";
import type { CanonicalGameId } from "@/lib/games/ids";
import type { PercentileDistributionData } from "@/lib/games/maimai/percentile/types";
import type { GamePlayerScore } from "@/lib/games/player-view";
import type { FetchedRecentPlayDetails } from "@/lib/games/recent-details";
import type { RecentPlay } from "@/lib/trpc-types";
import { ChunithmRecentPlayDetails } from "./chunithm/recent-play-details";
import { MaimaiRecentPlayDetails } from "./maimai/recent-play-details";
import { SongHoverCard } from "./maimai/song-hover-card";
import { MaimaiSearchSources } from "./maimai/search-sources";
import type { PaletteItem } from "@/components/command-palette/types";

export type ScoreHoverProps = {
  score: Pick<GamePlayerScore, "songId" | "songName" | "artist" | "cover" | "difficultyCode" | "typeCode">;
  children: ReactNode;
  side?: "right";
  percentile?: PercentileDistributionData;
  /** Loads the score comparison when the hover opens, for lists that don't preload it. A null score is an unplayed chart. */
  percentileSource?: { userRating: number; scoreValue: number | null };
};

export type SearchSourcesProps = {
  /** Whether the palette is open, so sources only load what they search when it is used. */
  enabled: boolean;
  /** Reports the game's own searchable items, such as maimai's events. */
  onItems: (items: PaletteItem[]) => void;
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
  /** Searchable items only this game has, offered to the command palette. */
  SearchSources?: ComponentType<SearchSourcesProps>;
};

function PlainScore({ children }: ScoreHoverProps) {
  return <>{children}</>;
}

export const GAME_UI: { [G in CanonicalGameId]: GameUI<G> } = {
  maimai: { ScoreHover: SongHoverCard, RecentDetails: MaimaiRecentPlayDetails, SearchSources: MaimaiSearchSources },
  chunithm: { ScoreHover: PlainScore, RecentDetails: ChunithmRecentPlayDetails },
};

/** Renders a fetched playlog with its game's panel. */
export function RecentPlaylog<G extends CanonicalGameId>({ details, play }: RecentDetailsProps<G>) {
  const { RecentDetails } = GAME_UI[details.game];
  return <RecentDetails details={details} play={play} />;
}
