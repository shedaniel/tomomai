"use client";

import { Region, SnapshotWithSongs } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Clock, Code, Database, Disc, Heart, Image as ImageIcon, Loader2, Map, Music, TrendingUp, User, Images } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { InfoCard } from "./info-card";
import { SongsCard } from "./songs-card";
import { RecommendationCard } from "./recommendation-card";
import { ExportImageCard } from "./export-image-card";
import { HistoryCard } from "./history-card";
import { EventsCard } from "./events-card";
import { RecentSongsCard } from "./recent-songs-card";
import { DeveloperCard } from "./developer-card";
import { AlbumCard } from "./album-card";
import { StatsCard } from "./stats-card";
import { Flags } from "@/lib/flags";
import { motion } from "motion/react";
import { getTransition } from "@/lib/animation-constants";

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
      show: visitedBySelf && flags.albumsCard,
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
      <Tabs
        orientation="vertical"
        value={selectedTab}
        onValueChange={handleTabChange}
        className="flex flex-col md:flex-row md:items-start gap-x-6 lg:gap-x-8 gap-y-6"
      >
        <TabsList className="shrink-0 flex flex-row justify-start overflow-x-auto gap-x-1 md:grid md:grid-cols-1 md:w-48 md:overflow-x-visible md:-ml-3 p-0 bg-background h-fit rounded-none">
          {visibleTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="justify-start rounded-md text-sm text-muted-foreground data-[state=active]:shadow-none data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:font-medium data-[state=active]:border data-[state=active]:border-border data-[state=active]:md:px-3.5 data-[state=active]:md:my-1 data-[state=active]:md:text-[15px] data-[state=active]:max-md:px-4 px-3 py-2 whitespace-nowrap shrink-0 md:shrink md:whitespace-normal transition-all">
              <tab.icon className="size-4 me-2 data-[state=active]:scale-125 transition-all" /> {tab.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="info" className="mt-0 flex-1 min-w-0 mx-1">
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={getTransition({ duration: 0.3, ease: [0.4, 0, 0.2, 1] })}
          >
            <InfoCard
              selectedSnapshotData={selectedSnapshotData}
              showPlayCounts={privacySettings.showPlayCounts}
              visitableProfileAt={visitableProfileAt}
            />
          </motion.div>
        </TabsContent>
        {(visitedBySelf || !!privacySettings.showAllScores) && (
          <TabsContent value="stats" className="mt-0 flex-1 min-w-0 mx-1">
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={getTransition({ duration: 0.3, ease: [0.4, 0, 0.2, 1] })}
            >
              <StatsCard
                region={region}
                selectedSnapshotData={selectedSnapshotData}
                snapshotId={visitedBySelf ? undefined : selectedSnapshotData?.snapshot.id}
              />
            </motion.div>
          </TabsContent>
        )}
        <TabsContent value="songs" className="mt-0 flex-1 min-w-0 mx-1">
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={getTransition({ duration: 0.3, ease: [0.4, 0, 0.2, 1] })}
          >
            <SongsCard selectedSnapshotData={selectedSnapshotData} />
          </motion.div>
        </TabsContent>
        {(visitedBySelf || !!privacySettings.showScoreDetails) && (
          <TabsContent value="recent" className="mt-0 flex-1 min-w-0 mx-1">
            <RecentSongsCard
              region={region}
              beforeDate={selectedSnapshotData?.snapshot.fetchedAt}
              snapshotId={visitedBySelf ? undefined : selectedSnapshotData?.snapshot.id}
            />
          </TabsContent>
        )}
        <TabsContent value="recommendations" className="mt-0 flex-1 min-w-0 mx-1">
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={getTransition({ duration: 0.3, ease: [0.4, 0, 0.2, 1] })}
          >
            <RecommendationCard selectedSnapshotData={selectedSnapshotData} flags={flags} />
          </motion.div>
        </TabsContent>
        {visitedBySelf && flags.historyCard && (
          <TabsContent value="history" className="mt-0 flex-1 min-w-0 mx-1">
            <HistoryCard region={region} />
          </TabsContent>
        )}
        {privacySettings.showEvents && (
          <TabsContent value="map" className="mt-0 flex-1 min-w-0 mx-1">
            <EventsCard selectedSnapshotData={selectedSnapshotData} />
          </TabsContent>
        )}
        <TabsContent value="exportImage" className="mt-0 flex-1 min-w-0 mx-1">
          <ExportImageCard selectedSnapshotData={selectedSnapshotData} region={region} showLastCredit={visitedBySelf || !!privacySettings.showScoreDetails} username={visitableProfileAt ?? undefined} />
        </TabsContent>
        {visitedBySelf && (
          <TabsContent value="developer" className="mt-0 flex-1 min-w-0 mx-1">
            <DeveloperCard selectedSnapshotData={selectedSnapshotData} />
          </TabsContent>
        )}
        {visitedBySelf && flags.albumsCard && (
          <TabsContent value="albums" className="mt-0 flex-1 min-w-0 mx-1">
            <AlbumCard region={region} />
          </TabsContent>
        )}
      </Tabs>
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
