"use client";

import { Region, SnapshotWithSongs } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Database, Disc, Heart, Image as ImageIcon, Loader2, Map, Music, TrendingUp, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { InfoCard } from "./info-card";
import { SongsCard } from "./songs-card";
import { RecommendationCard } from "./recommendation-card";
import { ExportImageCard } from "./export-image-card";
import { HistoryCard } from "./history-card";
import { EventsCard } from "./events-card";
import { Flags } from "@/lib/flags";

interface DataContentProps {
  region: Region;
  selectedSnapshotData: SnapshotWithSongs | null;
  isLoading: boolean;
  privacySettings?: {
    showPlayCounts?: boolean;
    showPlates?: boolean;
    showEvents?: boolean;
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
  const allPossibleTabs = ["info", "songs", "recommendations", "plates", "map", "exportImage", "history"];
  
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
      show: flags.statsCard,
    },
    {
      name: t('dataContent.tabs.songs'),
      value: "songs",
      icon: Music,
      show: true,
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
      name: t('dataContent.tabs.plates'),
      value: "plates",
      icon: Disc,
      show: privacySettings.showPlates,
    },
    {
      name: t('dataContent.tabs.map'),
      value: "map",
      icon: Map,
      show: privacySettings.showEvents,
    },
    {
      name: t('dataContent.tabs.exportImage'),
      value: "exportImage",
      icon: ImageIcon,
      show: true,
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
        className="flex flex-col md:flex-row md:items-start"
      >
        <TabsList className="shrink-0 grid grid-cols-1 min-w-30 p-0 bg-background md:mt-4 font-semibold max-md:h-fit max-md:mb-4">
          {visibleTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="border-l-2 border-transparent justify-start rounded-none data-[state=active]:shadow-none data-[state=active]:border-primary data-[state=active]:bg-primary/5 py-1.5 pr-4">
              <tab.icon className="h-5 w-5 me-3" /> {tab.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="info" className="mt-0 flex-1 min-w-0">
          <InfoCard 
            selectedSnapshotData={selectedSnapshotData} 
            showPlayCounts={privacySettings.showPlayCounts}
            visitableProfileAt={visitableProfileAt}
          />
        </TabsContent>
        <TabsContent value="songs" className="mt-0 flex-1 min-w-0">
          <SongsCard selectedSnapshotData={selectedSnapshotData} />
        </TabsContent>
        <TabsContent value="recommendations" className="mt-0 flex-1 min-w-0">
          <RecommendationCard selectedSnapshotData={selectedSnapshotData} flags={flags} />
        </TabsContent>
        {visitedBySelf && flags.historyCard && (
          <TabsContent value="history" className="mt-0 flex-1 min-w-0">
            <HistoryCard region={region} />
          </TabsContent>
        )}
        {privacySettings.showPlates && (
          <TabsContent value="plates" className="mt-0 flex-1 min-w-0">
            <div className="p-8 text-center w-full h-[calc(100vh-20rem)] flex flex-col items-center justify-center">
              <Disc className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">{t('dataContent.tabs.plates')}</h3>
              <p className="text-muted-foreground">Coming soon...</p>
            </div>
          </TabsContent>
        )}
        {privacySettings.showEvents && (
          <TabsContent value="map" className="mt-0 flex-1 min-w-0">
            <EventsCard selectedSnapshotData={selectedSnapshotData} />
          </TabsContent>
        )}
        <TabsContent value="exportImage" className="mt-0 flex-1 min-w-0">
          <ExportImageCard selectedSnapshotData={selectedSnapshotData} />
        </TabsContent>
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