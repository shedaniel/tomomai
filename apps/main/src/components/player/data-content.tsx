"use client";

import { useGame } from "@/components/providers/game-provider";
import { supportsGameFeature } from "@/lib/games/frontend";
import type { GameSnapshotData } from "@/lib/games/player-view";
import type { ProfilePrivacySettings, Region } from "@/lib/types";
import { Sidebar, SidebarItem } from "@tomomai/ui";
import { Database, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { MinigameCards } from "@/components/games/maimai/minigame-cards";
import type { Flags } from "@/lib/flags";
import { AnimatePresence, motion } from "motion/react";
import { getTransition } from "@/lib/animation-constants";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { PlayerProfile } from "./info-card";
import { DEFAULT_PLAYER_TAB, getVisiblePlayerTabs, isPlayerTabId, type PlayerTabContext, type PlayerTabId } from "./player-tabs";

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
  selectedSnapshotData: GameSnapshotData | null;
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
  const game = useGame();
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

  // SSR passes initialTab; a client navigation only has the search params.
  const getInitialTab = (): PlayerTabId => {
    if (isPlayerTabId(initialTab)) return initialTab;
    const tabParam = searchParams.get('tab');
    return isPlayerTabId(tabParam) ? tabParam : DEFAULT_PLAYER_TAB;
  };

  const [selectedTab, setSelectedTab] = useState<PlayerTabId>(getInitialTab);

  // Update the URL via the native History API so Next.js doesn't re-fetch the
  // RSC payload and re-suspend the <Suspense> boundary that wraps DataContent
  // (which is what caused the tab+content to flash out on every tab switch).
  const updateTabUrl = (value: PlayerTabId) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (value === DEFAULT_PLAYER_TAB) {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  };

  const handleTabChange = (value: string) => {
    if (!isPlayerTabId(value)) return;
    setSelectedTab(value);
    updateTabUrl(value);
  };

  const tabContext: PlayerTabContext = { visitedBySelf, privacy: localPrivacySettings, flags };
  const visibleTabs = getVisiblePlayerTabs(game, region, tabContext);
  const activeTab = visibleTabs.find(tab => tab.id === selectedTab) ?? visibleTabs[0];
  const activeTabId = activeTab?.id;

  // A tab the game, the privacy settings or the flags hide falls back to the first visible one.
  useEffect(() => {
    if (selectedSnapshotData && activeTabId && activeTabId !== selectedTab) {
      setSelectedTab(activeTabId);
      updateTabUrl(activeTabId);
    }
  }, [selectedTab, activeTabId, selectedSnapshotData]);

  const profile: PlayerProfile = {
    visitableProfileAt: effectiveVisitableProfileAt,
    profileUsername: effectiveProfileUsername,
    profileDescription: localProfileDescription,
    profileUserId,
    isOwner,
    publishProfile: localPublishProfile,
    descriptionDraft,
    isDescriptionEditing,
    onDescriptionDraftChange: setDescriptionDraft,
    onDescriptionEditingChange: setIsDescriptionEditing,
    onProfileDescriptionChange: setLocalProfileDescription,
    onPrivacySettingsChange: setLocalPrivacySettings,
    onPublishProfileChange: setLocalPublishProfile,
  };

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
            value={activeTabId}
            onValueChange={handleTabChange}
            className="sm:flex-row sm:w-full md:flex-col md:w-48 md:overflow-x-visible md:-ml-3"
          >
            {visibleTabs.map((tab) => (
              <SidebarItem key={tab.id} value={tab.id} icon={tab.icon} text={t(tab.labelKey)} />
            ))}
          </Sidebar>
          <div className="max-md:hidden md:w-48 md:-ml-3">
            {supportsGameFeature(game, "minigames") && <MinigameCards className="grid-cols-1" />}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTabId}
            initial={{ opacity: 0, ...(isDesktop ? { y: 10 } : { x: 10 }) }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, ...(isDesktop ? { y: -10 } : { x: -10 }) }}
            transition={getTransition({ duration: 0.2, ease: [0.4, 0, 0.2, 1] })}
            className="flex-1 min-w-0 mx-1"
          >
            {activeTab && (
              <activeTab.Component
                {...tabContext}
                data={selectedSnapshotData}
                region={region}
                profile={profile}
                publicSnapshotId={visitedBySelf ? undefined : selectedSnapshotData.snapshot.publicId}
              />
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
        {supportsGameFeature(game, "scores") ? t('dataContent.getStartedInstructions', { game: game.brand.displayName }) : t('settings.pages.fetch.unavailable', { game: game.brand.displayName })}
      </p>
    </div>
  );
}
