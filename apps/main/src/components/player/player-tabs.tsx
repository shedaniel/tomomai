"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { BarChart, Clock, Code, Heart, Image as ImageIcon, Images, Map, Music, TrendingUp, User, type LucideIcon } from "lucide-react";
import type { Flags } from "@/lib/flags";
import { supportsGameFeature, type FrontendGame } from "@/lib/games/frontend";
import type { GameSnapshotData } from "@/lib/games/player-view";
import { PUBLIC_VIEWS } from "@/lib/games/public-player";
import type { GameCapability } from "@/lib/games/types";
import type { ProfilePrivacySettings, Region } from "@/lib/types";
import { DeveloperCardSkeleton } from "@/components/games/maimai/developer-card.skeleton";
import { EventsCardSkeleton } from "@/components/games/maimai/events-card.skeleton";
import { ExportImageCardSkeleton } from "@/components/games/maimai/export-image-card.skeleton";
import { StatsCardSkeleton } from "@/components/games/maimai/stats-card.skeleton";
import { AlbumCardSkeleton } from "./album-card.skeleton";
import { HistoryCardSkeleton } from "./history-card.skeleton";
import { InfoCard, type PlayerProfile } from "./info-card";
import { RecentSongsCardSkeleton } from "./recent-songs-card.skeleton";
import { RecommendationCardSkeleton } from "./recommendation-card.skeleton";
import { SongsCard } from "./songs/songs-card";

// Info is the landing tab and Songs a primary destination, so both load eagerly. Every
// other card loads with its own skeleton, which gives Next's lazy component a local
// Suspense boundary (the one around DataContent has no fallback and would blank the
// sidebar) and makes the chunk placeholder match the data placeholder.
const StatsCard = dynamic(() => import("@/components/games/maimai/stats-card").then(m => m.StatsCard), { loading: () => <StatsCardSkeleton /> });
const RecommendationCard = dynamic(() => import("./recommendation-card").then(m => m.RecommendationCard), { loading: () => <RecommendationCardSkeleton /> });
const ExportImageCard = dynamic(() => import("@/components/games/maimai/export-image-card").then(m => m.ExportImageCard), { loading: () => <ExportImageCardSkeleton /> });
const HistoryCard = dynamic(() => import("./history-card").then(m => m.HistoryCard), { loading: () => <HistoryCardSkeleton /> });
const EventsCard = dynamic(() => import("@/components/games/maimai/events-card").then(m => m.EventsCard), { loading: () => <EventsCardSkeleton /> });
const RecentSongsCard = dynamic(() => import("./recent-songs-card").then(m => m.RecentSongsCard), { loading: () => <RecentSongsCardSkeleton /> });
const DeveloperCard = dynamic(() => import("@/components/games/maimai/developer-card").then(m => m.DeveloperCard), { loading: () => <DeveloperCardSkeleton /> });
const AlbumCard = dynamic(() => import("./album-card").then(m => m.AlbumCard), { loading: () => <AlbumCardSkeleton /> });

export type PlayerTabContext = {
  visitedBySelf: boolean;
  privacy: ProfilePrivacySettings;
  flags: Flags;
};

type PlayerTabProps = PlayerTabContext & {
  data: GameSnapshotData;
  region: Region;
  profile: PlayerProfile;
  /** The snapshot a visitor's queries go through. The owner reads their own data without one. */
  publicSnapshotId?: string;
};

type PlayerTab = {
  id: string;
  icon: LucideIcon;
  labelKey: string;
  capability: GameCapability;
  visible(context: PlayerTabContext): boolean;
  Component: ComponentType<PlayerTabProps>;
};

function InfoTab({ data, privacy, profile }: PlayerTabProps) {
  return <InfoCard selectedSnapshotData={data} showPlayCounts={privacy.profileShowPlayCounts} {...profile} />;
}

function StatsTab({ region, visitedBySelf, privacy, publicSnapshotId }: PlayerTabProps) {
  return (
    <StatsCard
      region={region}
      snapshotId={publicSnapshotId}
      showScoreDetails={visitedBySelf || privacy.profileShowScoreDetails}
      showPlates={visitedBySelf || PUBLIC_VIEWS.plates(privacy)}
    />
  );
}

function SongsTab({ data, flags }: PlayerTabProps) {
  return <SongsCard selectedSnapshotData={data} flags={flags} />;
}

function RecentTab({ data, region, publicSnapshotId }: PlayerTabProps) {
  return <RecentSongsCard region={region} beforeDate={data.snapshot.fetchedAt} snapshotId={publicSnapshotId} />;
}

function RecommendationsTab({ data, region, flags }: PlayerTabProps) {
  return <RecommendationCard selectedSnapshotData={data} flags={flags} region={region} />;
}

function HistoryTab({ region }: PlayerTabProps) {
  return <HistoryCard region={region} />;
}

function AlbumsTab({ region }: PlayerTabProps) {
  return <AlbumCard region={region} />;
}

function MapTab({ data }: PlayerTabProps) {
  return <EventsCard events={data.events} />;
}

function ExportImageTab({ data, region, visitedBySelf, privacy, profile, publicSnapshotId }: PlayerTabProps) {
  return (
    <ExportImageCard
      snapshot={data.snapshot}
      region={region}
      showLastCredit={visitedBySelf || PUBLIC_VIEWS.recentPlays(privacy)}
      username={profile.visitableProfileAt ?? undefined}
      publicSnapshotId={publicSnapshotId}
    />
  );
}

function DeveloperTab({ data }: PlayerTabProps) {
  return <DeveloperCard snapshotId={data.snapshot.publicId} />;
}

const PLAYER_TABS = [
  { id: "info", icon: User, labelKey: "dataContent.tabs.playerInfo", capability: "scores", visible: () => true, Component: InfoTab },
  { id: "stats", icon: BarChart, labelKey: "dataContent.tabs.stats", capability: "stats", visible: ({ visitedBySelf, privacy }) => visitedBySelf || PUBLIC_VIEWS.stats(privacy), Component: StatsTab },
  { id: "songs", icon: Music, labelKey: "dataContent.tabs.songs", capability: "scores", visible: () => true, Component: SongsTab },
  { id: "recent", icon: Clock, labelKey: "dataContent.tabs.recentPlays", capability: "recents", visible: ({ visitedBySelf, privacy }) => visitedBySelf || PUBLIC_VIEWS.recentPlays(privacy), Component: RecentTab },
  { id: "recommendations", icon: Heart, labelKey: "dataContent.tabs.recommendations", capability: "scores", visible: () => true, Component: RecommendationsTab },
  { id: "history", icon: TrendingUp, labelKey: "dataContent.tabs.history", capability: "rating", visible: ({ visitedBySelf, flags }) => visitedBySelf && flags.historyCard, Component: HistoryTab },
  { id: "albums", icon: Images, labelKey: "dataContent.tabs.albums", capability: "albums", visible: ({ visitedBySelf, flags }) => visitedBySelf && flags.albumsCard, Component: AlbumsTab },
  { id: "map", icon: Map, labelKey: "dataContent.tabs.map", capability: "events", visible: ({ privacy, flags }) => privacy.profileShowEvents && flags.eventsCard, Component: MapTab },
  { id: "exportImage", icon: ImageIcon, labelKey: "dataContent.tabs.exportImage", capability: "image-export", visible: () => true, Component: ExportImageTab },
  { id: "developer", icon: Code, labelKey: "dataContent.tabs.developer", capability: "developer-export", visible: ({ visitedBySelf }) => visitedBySelf, Component: DeveloperTab },
] as const satisfies readonly PlayerTab[];

export type PlayerTabId = (typeof PLAYER_TABS)[number]["id"];

export const DEFAULT_PLAYER_TAB: PlayerTabId = "info";

export function isPlayerTabId(value: string | null | undefined): value is PlayerTabId {
  return PLAYER_TABS.some(tab => tab.id === value);
}

export function getVisiblePlayerTabs(game: FrontendGame, region: Region, context: PlayerTabContext) {
  return PLAYER_TABS.filter(tab => supportsGameFeature(game, tab.capability, region) && tab.visible(context));
}
