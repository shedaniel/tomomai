"use client";

import { ProfilePrivacySettings, Region, SnapshotWithSongs } from "@/lib/types";
import { Sidebar, SidebarItem } from "@tomomai/ui";
import { BarChart, Clock, Code, Database, Heart, Image as ImageIcon, Loader2, Map, Music, TrendingUp, User, Images } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { InfoCard } from "./info-card";
import { MinigameCards } from "./minigame-cards";
import { SongsCard } from "./songs-card";
import { StatsCardSkeleton } from "./stats-card.skeleton";
import { RecommendationCardSkeleton } from "./recommendation-card.skeleton";
import { ExportImageCardSkeleton } from "./export-image-card.skeleton";
import { HistoryCardSkeleton } from "./history-card.skeleton";
import { EventsCardSkeleton } from "./events-card.skeleton";
import { RecentSongsCardSkeleton } from "./recent-songs-card.skeleton";
import { DeveloperCardSkeleton } from "./developer-card.skeleton";
import { AlbumCardSkeleton } from "./album-card.skeleton";
import { Flags } from "@/lib/flags";
import { AnimatePresence, motion } from "motion/react";
import { getTransition } from "@/lib/animation-constants";
import { useMediaQuery } from "@/hooks/use-media-query";
import dynamic from "next/dynamic";

// Tab cards lazy-loaded — only the selected tab's chunk is fetched.
// SongsCard + InfoCard stay eager because Info is the default landing tab
// and Songs remains a primary destination.
// Each dynamic() shares the card's own skeleton as its `loading`. That does
// two things: (1) gives Next 16's React.lazy a LOCAL Suspense boundary so the
// suspension doesn't bubble to the fallback-less <Suspense> wrapping
// DataContent (which rendered null and blanked the sidebar + content), and
// (2) makes the chunk-load placeholder identical to the data-load placeholder
// so the transition into real data is seamless.
const StatsCard = dynamic(() => import("./stats-card").then(m => m.StatsCard), { loading: () => <StatsCardSkeleton /> });
const RecommendationCard = dynamic(() => import("./recommendation-card").then(m => m.RecommendationCard), { loading: () => <RecommendationCardSkeleton /> });
const ExportImageCard = dynamic(() => import("./export-image-card").then(m => m.ExportImageCard), { loading: () => <ExportImageCardSkeleton /> });
const HistoryCard = dynamic(() => import("./history-card").then(m => m.HistoryCard), { loading: () => <HistoryCardSkeleton /> });
const EventsCard = dynamic(() => import("./events-card").then(m => m.EventsCard), { loading: () => <EventsCardSkeleton /> });
const RecentSongsCard = dynamic(() => import("./recent-songs-card").then(m => m.RecentSongsCard), { loading: () => <RecentSongsCardSkeleton /> });
const DeveloperCard = dynamic(() => import("./developer-card").then(m => m.DeveloperCard), { loading: () => <DeveloperCardSkeleton /> });
const AlbumCard = dynamic(() => import("./album-card").then(m => m.AlbumCard), { loading: () => <AlbumCardSkeleton /> });

const DEFAULT_PRIVACY_SETTINGS: ProfilePrivacySettings = {
  profileShowAllScores: true,
  profileShowScoreDetails: true,
  profileShowPlates: true,
  profileShowPlayCounts: true,
  profileShowEvents: true,
  profileShowInSearch: true,
};

interface DataContentProps {
  region: Region;
  selectedSnapshotData: SnapshotWithSongs | null;
  isLoading: boolean;
  privacySettings?: ProfilePrivacySettings;
  visitableProfileAt: string | null;
  profileDescription?: string | null;
  profileUsername?: string | null;
  profileUserId?: string | null;
  publishProfile?: boolean;
  isOwner?: boolean;
  initialTab?: string;
  visitedBySelf: boolean;
  flags: Flags;
}

export function DataContent({
  selectedSnapshotData,
  isLoading,
  privacySettings = DEFAULT_PRIVACY_SETTINGS,
  visitableProfileAt,
  profileDescription,
  profileUsername,
  profileUserId,
  publishProfile,
  isOwner = false,
  initialTab,
  visitedBySelf,
  region,
  flags,
}: DataContentProps) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const isDesktop = useMediaQuery("(min-width: 768px)", { initializeWithValue: false });
  const [localPrivacySettings, setLocalPrivacySettings] = useState(privacySettings);
  const [localPublishProfile, setLocalPublishProfile] = useState(publishProfile ?? !!visitableProfileAt);
  const [localProfileDescription, setLocalProfileDescription] = useState(profileDescription ?? null);
  const [descriptionDraft, setDescriptionDraft] = useState(profileDescription ?? "");
  const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);

  useEffect(() => {
    setLocalPrivacySettings(privacySettings);
  }, [privacySettings]);

  useEffect(() => {
    setLocalPublishProfile(publishProfile ?? !!visitableProfileAt);
  }, [publishProfile, visitableProfileAt]);

  useEffect(() => {
    setLocalProfileDescription(profileDescription ?? null);
    if (!isDescriptionEditing) setDescriptionDraft(profileDescription ?? "");
  }, [profileDescription, isDescriptionEditing]);

  const effectiveProfileUsername = profileUsername ?? visitableProfileAt;
  const effectiveVisitableProfileAt = localPublishProfile ? effectiveProfileUsername : null;

  // Valid tab values
  const allPossibleTabs = ["info", "stats", "songs", "recent", "recommendations", "map", "exportImage", "history", "developer", "albums"];

  // Get initial tab from props (SSR) or search params (client)
  const getInitialTab = () => {
    // First priority: initialTab from SSR
    if (initialTab && allPossibleTabs.includes(initialTab)) {
      return initialTab;
    }

    // Second priority: search params (client-side)
    const tabParam = searchParams.get('tab');
    if (tabParam && allPossibleTabs.includes(tabParam)) {
      return tabParam;
    }

    // Default fallback
    return "info";
  };

  const [selectedTab, setSelectedTab] = useState(getInitialTab);

  // Update the URL via the native History API so Next.js doesn't re-fetch the
  // RSC payload and re-suspend the <Suspense> boundary that wraps DataContent
  // (which is what caused the tab+content to flash out on every tab switch).
  const updateTabUrl = (value: string) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (value === "info") {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  };

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setSelectedTab(value);
    updateTabUrl(value);
  };

  // Define visible tabs based on privacy settings
  const allTabs = [
    {
      name: t('dataContent.tabs.playerInfo'),
      value: "info",
      icon: User,
      show: true,
    },
    {
      name: t('dataContent.tabs.stats'),
      value: "stats",
      icon: BarChart,
      show: visitedBySelf || !!localPrivacySettings.profileShowAllScores,
    },
    {
      name: t('dataContent.tabs.songs'),
      value: "songs",
      icon: Music,
      show: true,
    },
    {
      name: t('dataContent.tabs.recentPlays'),
      value: "recent",
      icon: Clock,
      show: visitedBySelf || !!localPrivacySettings.profileShowScoreDetails,
    },
    {
      name: t('dataContent.tabs.recommendations'),
      value: "recommendations",
      icon: Heart,
      show: true,
    },
    {
      name: t('dataContent.tabs.history'),
      value: "history",
      icon: TrendingUp,
      show: visitedBySelf && flags.historyCard,
    },
    {
      name: t('dataContent.tabs.albums'),
      value: "albums",
      icon: Images,
      show: visitedBySelf && flags.albumsCard && region !== "cn",
    },
    {
      name: t('dataContent.tabs.map'),
      value: "map",
      icon: Map,
      show: localPrivacySettings.profileShowEvents && flags.eventsCard,
    },
    {
      name: t('dataContent.tabs.exportImage'),
      value: "exportImage",
      icon: ImageIcon,
      show: true,
    },
    {
      name: t('dataContent.tabs.developer'),
      value: "developer",
      icon: Code,
      show: visitedBySelf,
    }
  ];

  const visibleTabs = allTabs.filter(tab => tab.show);
  const validTabs = visibleTabs.map(tab => tab.value);

  // Ensure selected tab is valid/visible, fallback to info if not
  useEffect(() => {
    if (selectedSnapshotData && !validTabs.includes(selectedTab)) {
      setSelectedTab("info");
      updateTabUrl("info");
    }
  }, [selectedTab, validTabs, selectedSnapshotData]);

  if (isLoading) {
    return (
      <div className="p-8 text-center w-full h-[calc(100vh-20rem)] flex flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-spin" />
        <h3 className="text-lg font-medium mb-2">{t('dataContent.loading')}</h3>
      </div>
    );
  }

  if (selectedSnapshotData) {
    return (
      <div className="flex flex-col md:flex-row md:items-start gap-x-6 lg:gap-x-8 gap-y-6">
        <div className="max-md:contents md:flex md:flex-col md:gap-4">
          <Sidebar
            value={selectedTab}
            onValueChange={handleTabChange}
            className="sm:flex-row sm:w-full md:flex-col md:w-48 md:overflow-x-visible md:-ml-3"
          >
            {visibleTabs.map((tab) => (
              <SidebarItem key={tab.value} value={tab.value} icon={tab.icon} text={tab.name} />
            ))}
          </Sidebar>
          <div className="max-md:hidden md:w-48 md:-ml-3">
            <MinigameCards className="grid-cols-1" />
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={selectedTab}
            initial={{ opacity: 0, ...(isDesktop ? { y: 10 } : { x: 10 }) }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, ...(isDesktop ? { y: -10 } : { x: -10 }) }}
            transition={getTransition({ duration: 0.2, ease: [0.4, 0, 0.2, 1] })}
            className="flex-1 min-w-0 mx-1"
          >
            {selectedTab === "info" && (
              <InfoCard
                selectedSnapshotData={selectedSnapshotData}
                showPlayCounts={localPrivacySettings.profileShowPlayCounts}
                visitableProfileAt={effectiveVisitableProfileAt}
                profileUsername={effectiveProfileUsername}
                profileDescription={localProfileDescription}
                profileUserId={profileUserId}
                isOwner={isOwner}
                privacySettings={localPrivacySettings}
                publishProfile={localPublishProfile}
                descriptionDraft={descriptionDraft}
                isDescriptionEditing={isDescriptionEditing}
                onDescriptionDraftChange={setDescriptionDraft}
                onDescriptionEditingChange={setIsDescriptionEditing}
                onProfileDescriptionChange={setLocalProfileDescription}
                onPrivacySettingsChange={setLocalPrivacySettings}
                onPublishProfileChange={setLocalPublishProfile}
              />
            )}
            {selectedTab === "stats" && (visitedBySelf || !!localPrivacySettings.profileShowAllScores) && (
              <StatsCard
                region={region}
                selectedSnapshotData={selectedSnapshotData}
                snapshotId={visitedBySelf ? undefined : selectedSnapshotData?.snapshot.id}
              />
            )}
            {selectedTab === "songs" && (
              <SongsCard selectedSnapshotData={selectedSnapshotData} flags={flags} />
            )}
            {selectedTab === "recent" && (visitedBySelf || !!localPrivacySettings.profileShowScoreDetails) && (
              <RecentSongsCard
                region={region}
                beforeDate={selectedSnapshotData?.snapshot.fetchedAt}
                snapshotId={visitedBySelf ? undefined : selectedSnapshotData?.snapshot.id}
              />
            )}
            {selectedTab === "recommendations" && (
              <RecommendationCard selectedSnapshotData={selectedSnapshotData} flags={flags} />
            )}
            {selectedTab === "history" && visitedBySelf && flags.historyCard && (
              <HistoryCard region={region} />
            )}
            {selectedTab === "map" && localPrivacySettings.profileShowEvents && (
              <EventsCard selectedSnapshotData={selectedSnapshotData} />
            )}
            {selectedTab === "exportImage" && (
              <ExportImageCard
                selectedSnapshotData={selectedSnapshotData}
                region={region}
                showLastCredit={visitedBySelf || !!localPrivacySettings.profileShowScoreDetails}
                username={effectiveVisitableProfileAt ?? undefined}
                publicSnapshotId={visitedBySelf ? undefined : selectedSnapshotData.snapshot.id}
              />
            )}
            {selectedTab === "developer" && visitedBySelf && (
              <DeveloperCard selectedSnapshotData={selectedSnapshotData} />
            )}
            {selectedTab === "albums" && visitedBySelf && flags.albumsCard && (
              <AlbumCard region={region} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="p-8 text-center w-full h-[calc(100vh-20rem)] flex flex-col items-center justify-center">
      <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
      <h3 className="text-lg font-medium mb-2">{t('dataContent.noDataAvailable')}</h3>
      <p className="text-muted-foreground">
        {t('dataContent.getStartedInstructions')}
      </p>
    </div>
  );
}
