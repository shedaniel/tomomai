"use client";

import { Region, SnapshotWithSongs } from "@/lib/types";
import { Sidebar, SidebarItem } from "@tomomai/ui";
import { BarChart, Clock, Code, Database, Heart, Image as ImageIcon, Loader2, Map, Music, TrendingUp, User, Images } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { InfoCard } from "./info-card";
import { MinigameCards } from "./minigame-cards";
import { SongsCard } from "./songs-card";
import { Flags } from "@/lib/flags";
import { AnimatePresence, motion } from "motion/react";
import { getTransition } from "@/lib/animation-constants";
import { useMediaQuery } from "@/hooks/use-media-query";
import dynamic from "next/dynamic";

// Tab cards lazy-loaded — only the selected tab's chunk is fetched.
// SongsCard + InfoCard stay eager because Songs is the default landing tab
// and InfoCard is small and frequently shown.
const StatsCard = dynamic(() => import("./stats-card").then(m => m.StatsCard));
const RecommendationCard = dynamic(() => import("./recommendation-card").then(m => m.RecommendationCard));
const ExportImageCard = dynamic(() => import("./export-image-card").then(m => m.ExportImageCard));
const HistoryCard = dynamic(() => import("./history-card").then(m => m.HistoryCard));
const EventsCard = dynamic(() => import("./events-card").then(m => m.EventsCard));
const RecentSongsCard = dynamic(() => import("./recent-songs-card").then(m => m.RecentSongsCard));
const DeveloperCard = dynamic(() => import("./developer-card").then(m => m.DeveloperCard));
const AlbumCard = dynamic(() => import("./album-card").then(m => m.AlbumCard));

interface DataContentProps {
  region: Region;
  selectedSnapshotData: SnapshotWithSongs | null;
  isLoading: boolean;
  privacySettings?: {
    showPlayCounts?: boolean;
    showPlates?: boolean;
    showEvents?: boolean;
    showAllScores?: boolean;
    showScoreDetails?: boolean;
  };
  visitableProfileAt: string | null;
  initialTab?: string;
  visitedBySelf: boolean;
  flags: Flags;
}

export function DataContent({
  selectedSnapshotData,
  isLoading,
  privacySettings = {
    showPlayCounts: true,
    showPlates: true,
    showEvents: true,
    showAllScores: true,
    showScoreDetails: true,
  },
  visitableProfileAt,
  initialTab,
  visitedBySelf,
  region,
  flags,
}: DataContentProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDesktop = useMediaQuery("(min-width: 768px)", { initializeWithValue: false });

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
    return "songs";
  };

  const [selectedTab, setSelectedTab] = useState(getInitialTab);

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setSelectedTab(value);

    // Create new search params
    const newSearchParams = new URLSearchParams(searchParams.toString());

    if (value === "songs") {
      // Remove tab parameter for default tab
      newSearchParams.delete('tab');
    } else {
      // Set tab parameter for non-default tabs
      newSearchParams.set('tab', value);
    }

    // Build the URL with or without search params
    const searchString = newSearchParams.toString();
    const newUrl = searchString ? `${pathname}?${searchString}` : pathname;

    // Update URL without triggering a full page reload
    router.replace(newUrl, { scroll: false });
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
      show: visitedBySelf || !!privacySettings.showAllScores,
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
      show: visitedBySelf || !!privacySettings.showScoreDetails,
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
      show: privacySettings.showEvents && flags.eventsCard,
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

  // Ensure selected tab is valid/visible, fallback to songs if not
  useEffect(() => {
    if (selectedSnapshotData && !validTabs.includes(selectedTab)) {
      setSelectedTab("songs");
      const newSearchParams = new URLSearchParams(searchParams.toString());
      newSearchParams.delete('tab'); // Remove tab param when falling back to songs
      const searchString = newSearchParams.toString();
      const newUrl = searchString ? `${pathname}?${searchString}` : pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [selectedTab, validTabs, pathname, router, searchParams, selectedSnapshotData]);

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
                showPlayCounts={privacySettings.showPlayCounts}
                visitableProfileAt={visitableProfileAt}
              />
            )}
            {selectedTab === "stats" && (visitedBySelf || !!privacySettings.showAllScores) && (
              <StatsCard
                region={region}
                selectedSnapshotData={selectedSnapshotData}
                snapshotId={visitedBySelf ? undefined : selectedSnapshotData?.snapshot.id}
              />
            )}
            {selectedTab === "songs" && (
              <SongsCard selectedSnapshotData={selectedSnapshotData} flags={flags} />
            )}
            {selectedTab === "recent" && (visitedBySelf || !!privacySettings.showScoreDetails) && (
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
            {selectedTab === "map" && privacySettings.showEvents && (
              <EventsCard selectedSnapshotData={selectedSnapshotData} />
            )}
            {selectedTab === "exportImage" && (
              <ExportImageCard selectedSnapshotData={selectedSnapshotData} region={region} showLastCredit={visitedBySelf || !!privacySettings.showScoreDetails} username={visitableProfileAt ?? undefined} />
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
