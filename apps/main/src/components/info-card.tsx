"use client";

import type { ProfilePrivacySettings, SnapshotWithSongs } from "@/lib/types";

import {
  ConfirmUnpublishDialog,
  DescriptionDiscardDialog,
  PlayerIdentitySummary,
  PlayerStatisticsBlock,
  PrivacySettingsDialog,
  ProfileAboutSection,
  ProfileVisibilityBanner,
} from "./info-card/sections";
import { useInfoCardOwnerSettings } from "./info-card/use-info-card-owner-settings";

interface InfoCardProps {
  selectedSnapshotData: SnapshotWithSongs;
  showPlayCounts?: boolean;
  visitableProfileAt: string | null;
  profileUsername?: string | null;
  profileDescription?: string | null;
  profileUserId?: string | null;
  isOwner?: boolean;
  privacySettings: ProfilePrivacySettings;
  publishProfile: boolean;
  descriptionDraft: string;
  isDescriptionEditing: boolean;
  onDescriptionDraftChange(value: string): void;
  onDescriptionEditingChange(value: boolean): void;
  onProfileDescriptionChange(value: string | null): void;
  onPrivacySettingsChange(value: ProfilePrivacySettings): void;
  onPublishProfileChange(value: boolean): void;
}

export function InfoCard({
  selectedSnapshotData,
  showPlayCounts = true,
  visitableProfileAt,
  profileUsername,
  profileDescription,
  profileUserId,
  isOwner = false,
  privacySettings,
  publishProfile,
  descriptionDraft,
  isDescriptionEditing,
  onDescriptionDraftChange,
  onDescriptionEditingChange,
  onProfileDescriptionChange,
  onPrivacySettingsChange,
  onPublishProfileChange,
}: InfoCardProps) {
  const ownerSettings = useInfoCardOwnerSettings({
    isOwner,
    profileDescription,
    descriptionDraft,
    isDescriptionEditing,
    onDescriptionDraftChange,
    onDescriptionEditingChange,
    onProfileDescriptionChange,
    onPrivacySettingsChange,
    onPublishProfileChange,
  });
  const { snapshot } = selectedSnapshotData;
  const aboutUsername = profileUsername ?? snapshot.displayName;

  return (
    <div className="space-y-6">
      <ProfileVisibilityBanner
        visitableProfileAt={visitableProfileAt}
        isOwner={isOwner}
        profileSettingsLoading={ownerSettings.profileSettingsLoading}
        onOpenSettings={ownerSettings.visibility.openSettings}
      />
      <PlayerIdentitySummary snapshot={snapshot} />
      <PlayerStatisticsBlock snapshot={snapshot} showPlayCounts={showPlayCounts} />
      <ProfileAboutSection
        username={aboutUsername}
        profileUserId={profileUserId}
        canonicalDescription={ownerSettings.canonicalDescription}
        descriptionDraft={descriptionDraft}
        isDescriptionEditing={isDescriptionEditing}
        isOwner={isOwner}
        publishProfile={publishProfile}
        profileSettingsLoading={ownerSettings.profileSettingsLoading}
        onDescriptionDraftChange={onDescriptionDraftChange}
        controller={ownerSettings.description}
      />
      <PrivacySettingsDialog
        profileSettings={ownerSettings.profileSettings}
        profileSettingsLoading={ownerSettings.profileSettingsLoading}
        controller={ownerSettings.visibility}
      />
      <DescriptionDiscardDialog controller={ownerSettings.description} />
      <ConfirmUnpublishDialog controller={ownerSettings.visibility} />
    </div>
  );
}
