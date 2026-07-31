"use client";

import { DescriptionDiscardDialog, ProfileAboutSection } from "@/components/profile-about-section";
import { PROFILE_PRIVACY_FIELDS } from "@/components/profile-privacy-fields";
import {
  ConfirmUnpublishDialog,
  ProfileVisibilityDialog,
  type VisibilityDraft,
} from "@/components/profile-visibility-dialog";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Link } from "@/i18n/navigation";
import { SPRING_CONFIGS, STAGGER, getTransition } from "@/lib/animation-constants";
import { resolveBaseUrl } from "@/lib/base-url";
import { VersionId } from "@/lib/metadata";
import { getRatingImageUrl } from "@/lib/rating-calculator";
import { trpc } from "@/lib/trpc-client";
import type { ProfilePrivacySettings, ProfileSettings, SnapshotWithSongs } from "@/lib/types";
import { createSafeMaimaiImageUrl, isR2Url } from "@/lib/utils";
import { Button } from "@tomomai/ui";
import { Settings2 } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function privacySettingsFromProfile(settings: ProfileSettings): ProfilePrivacySettings {
  return {
    profileShowAllScores: settings.profileShowAllScores,
    profileShowScoreDetails: settings.profileShowScoreDetails,
    profileShowPlates: settings.profileShowPlates,
    profileShowPlayCounts: settings.profileShowPlayCounts,
    profileShowEvents: settings.profileShowEvents,
    profileShowInSearch: settings.profileShowInSearch,
  };
}

function privacySettingsEqual(left: ProfilePrivacySettings, right: ProfilePrivacySettings) {
  return PROFILE_PRIVACY_FIELDS.every(([key]) => left[key] === right[key]);
}

interface UseInfoCardOwnerSettingsOptions {
  isOwner: boolean;
  profileDescription?: string | null;
  descriptionDraft: string;
  isDescriptionEditing: boolean;
  onDescriptionDraftChange(value: string): void;
  onDescriptionEditingChange(value: boolean): void;
  onProfileDescriptionChange(value: string | null): void;
  onPrivacySettingsChange(value: ProfilePrivacySettings): void;
  onPublishProfileChange(value: boolean): void;
}

function useInfoCardOwnerSettings({
  isOwner,
  profileDescription,
  descriptionDraft,
  isDescriptionEditing,
  onDescriptionDraftChange,
  onDescriptionEditingChange,
  onProfileDescriptionChange,
  onPrivacySettingsChange,
  onPublishProfileChange,
}: UseInfoCardOwnerSettingsOptions) {
  const t = useTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [descriptionError, setDescriptionError] = useState<string>();
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [visibilityDraft, setVisibilityDraft] = useState<VisibilityDraft>();
  const [visibilityError, setVisibilityError] = useState<string>();
  const [confirmUnpublishOpen, setConfirmUnpublishOpen] = useState(false);

  const { data: profileSettings, isLoading: profileSettingsLoading } =
    trpc.user.getProfileSettings.useQuery(undefined, {
      enabled: isOwner,
      refetchOnWindowFocus: false,
    });

  const updateProfileDescription = trpc.user.updateProfileDescription.useMutation();
  const updatePublishProfile = trpc.user.updatePublishProfile.useMutation();
  const updateProfileMainRegion = trpc.user.updateProfileMainRegion.useMutation();
  const updateProfilePrivacySettings = trpc.user.updateProfilePrivacySettings.useMutation();

  const canonicalDescription = profileSettings?.profileDescription ?? profileDescription ?? null;
  const visibilitySaving =
    updatePublishProfile.isPending ||
    updateProfileMainRegion.isPending ||
    updateProfilePrivacySettings.isPending;

  useEffect(() => {
    if (!profileSettings) return;
    onPublishProfileChange(profileSettings.publishProfile);
    onPrivacySettingsChange(privacySettingsFromProfile(profileSettings));
    onProfileDescriptionChange(profileSettings.profileDescription);
    if (!isDescriptionEditing) {
      onDescriptionDraftChange(profileSettings.profileDescription ?? "");
    }
  }, [
    isDescriptionEditing,
    onDescriptionDraftChange,
    onPrivacySettingsChange,
    onProfileDescriptionChange,
    onPublishProfileChange,
    profileSettings,
  ]);

  function startEditingDescription() {
    onDescriptionDraftChange(canonicalDescription ?? "");
    setDescriptionError(undefined);
    onDescriptionEditingChange(true);
  }

  function discardDescriptionDraft() {
    onDescriptionDraftChange(canonicalDescription ?? "");
    setDescriptionError(undefined);
    onDescriptionEditingChange(false);
  }

  function requestCancelDescription() {
    if (descriptionDraft !== (canonicalDescription ?? "")) {
      setConfirmDiscardOpen(true);
      return;
    }
    discardDescriptionDraft();
  }

  async function saveDescription() {
    const normalizedDescription = descriptionDraft.trim() || null;
    setDescriptionError(undefined);
    try {
      await updateProfileDescription.mutateAsync({ profileDescription: normalizedDescription });
      utils.user.getProfileSettings.setData(undefined, (current) =>
        current ? { ...current, profileDescription: normalizedDescription } : current,
      );
      onProfileDescriptionChange(normalizedDescription);
      onDescriptionDraftChange(normalizedDescription ?? "");
      onDescriptionEditingChange(false);
      toast.success(t("publicProfile.descriptionEditor.saveSuccess"));
    } catch {
      setDescriptionError(t("publicProfile.descriptionEditor.saveError"));
    }
  }

  function visibilityIsDirty(draft: VisibilityDraft, settings: ProfileSettings) {
    return (
      draft.publishProfile !== settings.publishProfile ||
      draft.profileMainRegion !== settings.profileMainRegion ||
      !privacySettingsEqual(draft.privacySettings, privacySettingsFromProfile(settings))
    );
  }

  async function saveVisibilitySettings() {
    if (!profileSettings || !visibilityDraft || visibilitySaving) return;

    const publishChanged = visibilityDraft.publishProfile !== profileSettings.publishProfile;
    const regionChanged = visibilityDraft.profileMainRegion !== profileSettings.profileMainRegion;
    const previousPrivacy = privacySettingsFromProfile(profileSettings);
    const privacyChanged = !privacySettingsEqual(visibilityDraft.privacySettings, previousPrivacy);
    const revealsHiddenData = PROFILE_PRIVACY_FIELDS.some(
      ([key]) => !previousPrivacy[key] && visibilityDraft.privacySettings[key],
    );

    setVisibilityError(undefined);
    try {
      const mutations: Promise<unknown>[] = [];
      if (publishChanged) {
        mutations.push(updatePublishProfile.mutateAsync({ publishProfile: visibilityDraft.publishProfile }));
      }
      if (regionChanged) {
        mutations.push(
          updateProfileMainRegion.mutateAsync({ profileMainRegion: visibilityDraft.profileMainRegion }),
        );
      }
      if (privacyChanged) {
        mutations.push(updateProfilePrivacySettings.mutateAsync(visibilityDraft.privacySettings));
      }
      await Promise.all(mutations);

      utils.user.getProfileSettings.setData(undefined, (current) =>
        current
          ? {
              ...current,
              publishProfile: visibilityDraft.publishProfile,
              profileMainRegion: visibilityDraft.profileMainRegion,
              ...visibilityDraft.privacySettings,
            }
          : current,
      );
      onPublishProfileChange(visibilityDraft.publishProfile);
      onPrivacySettingsChange(visibilityDraft.privacySettings);
      setVisibilityOpen(false);
      toast.success(t("publicProfile.visibilitySettings.saveSuccess"));
      if (revealsHiddenData) router.refresh();
    } catch {
      setVisibilityError(t("publicProfile.visibilitySettings.saveError"));
    }
  }

  function openVisibilitySettings() {
    if (!profileSettings) return;
    setVisibilityDraft({
      publishProfile: profileSettings.publishProfile,
      profileMainRegion: profileSettings.profileMainRegion,
      privacySettings: privacySettingsFromProfile(profileSettings),
    });
    setVisibilityError(undefined);
    setVisibilityOpen(true);
  }

  function handleVisibilityOpenChange(open: boolean) {
    if (visibilitySaving) return;
    setVisibilityOpen(open);
    if (!open) {
      setVisibilityDraft(undefined);
      setVisibilityError(undefined);
    }
  }

  function requestSaveVisibility() {
    if (profileSettings?.publishProfile && visibilityDraft?.publishProfile === false) {
      setConfirmUnpublishOpen(true);
      return;
    }
    void saveVisibilitySettings();
  }

  return {
    canonicalDescription,
    profileSettings,
    profileSettingsLoading,
    description: {
      confirmDiscardOpen,
      error: descriptionError,
      isSaving: updateProfileDescription.isPending,
      setConfirmDiscardOpen,
      startEditing: startEditingDescription,
      requestCancel: requestCancelDescription,
      discardDraft: discardDescriptionDraft,
      save: saveDescription,
    },
    visibility: {
      confirmUnpublishOpen,
      draft: visibilityDraft,
      error: visibilityError,
      isOpen: visibilityOpen,
      isSaving: visibilitySaving,
      setConfirmUnpublishOpen,
      setDraft: setVisibilityDraft,
      openSettings: openVisibilitySettings,
      close: () => setVisibilityOpen(false),
      handleOpenChange: handleVisibilityOpenChange,
      requestSave: requestSaveVisibility,
      save: saveVisibilitySettings,
      isDirty: visibilityIsDirty,
    },
  };
}

type Snapshot = SnapshotWithSongs["snapshot"];

function RatingImage({ rating, version }: { rating: number; version?: VersionId }) {
  return (
    <Image
      src={getRatingImageUrl(rating, version)}
      alt={rating.toString()}
      width={120}
      height={35}
      crossOrigin="anonymous"
    />
  );
}

interface ProfileVisibilityBannerProps {
  visitableProfileAt: string | null;
  isOwner: boolean;
  profileSettingsLoading: boolean;
  onOpenSettings(): void;
}

function ProfileVisibilityBanner({
  visitableProfileAt,
  isOwner,
  profileSettingsLoading,
  onOpenSettings,
}: ProfileVisibilityBannerProps) {
  const t = useTranslations();

  return (
    <div className="rounded-md bg-muted p-4 ring-2 ring-foreground/20 ring-offset-2 ring-offset-background">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {visitableProfileAt ? (
          <div>
            <h3 className="mb-1 font-medium text-foreground">{t("profileVisibility.public")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("profileVisibility.accessibleBy")}
              <Link
                href={`/profile/${visitableProfileAt}`}
                className="text-foreground underline hover:text-foreground/80"
              >
                {resolveBaseUrl()}/profile/{visitableProfileAt}
              </Link>
              {t("profileVisibility.accessibleByEnd")}
            </p>
          </div>
        ) : (
          <div>
            <h3 className="mb-1 font-medium text-primary">{t("profileVisibility.private")}</h3>
            <p className="text-sm text-muted-foreground">{t("profileVisibility.onlyAccessibleByYou")}</p>
          </div>
        )}
        {isOwner ? (
          <Button
            type="button"
            variant="outline"
            onClick={onOpenSettings}
            disabled={profileSettingsLoading}
            className="shrink-0 self-center"
          >
            <Settings2 />
            {t("publicProfile.visibilitySettings.trigger")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PlayerIdentitySummary({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="flex items-center gap-2">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={getTransition(SPRING_CONFIGS.default)}
      >
        <Image
          src={createSafeMaimaiImageUrl(snapshot.iconUrl)}
          unoptimized={isR2Url(snapshot.iconUrl)}
          alt={snapshot.title}
          width={80}
          height={80}
        />
      </motion.div>
      <div className="my-1 flex min-w-0 self-stretch flex-col items-stretch space-y-0.5">
        <span className="inset-shadow-sm truncate rounded-full bg-secondary px-6 py-1 text-center text-sm text-secondary-foreground">
          {snapshot.title}
        </span>
        <span className="flex items-center self-center text-lg font-medium max-xs:flex-col">
          <span className="mx-4 flex-1 whitespace-nowrap max-2xs:text-sm max-xs:text-md">
            {snapshot.displayName}
          </span>
          <div className="relative h-[35px] w-[120px] min-w-fit shrink-0 grow-0">
            <RatingImage rating={snapshot.rating} version={snapshot.gameVersion} />
            <span className="absolute top-[3px] left-[8px] box-border w-[106px] text-right font-mono text-[18px] font-normal tracking-[1.65px] text-white">
              {snapshot.rating}
            </span>
          </div>
        </span>
      </div>
    </div>
  );
}

interface PlayerStatisticsBlockProps {
  snapshot: Snapshot;
  showPlayCounts: boolean;
}

function PlayerStatisticsBlock({ snapshot, showPlayCounts }: PlayerStatisticsBlockProps) {
  const t = useTranslations();
  const isDesktop = useMediaQuery("(min-width: 768px)", { initializeWithValue: false });

  return (
    <div className="rounded-md bg-muted/50 p-4">
      <h4 className="mb-2 font-medium">{t("dataContent.playerInfo")}</h4>
      <div className={`grid gap-2 text-sm ${showPlayCounts ? "grid-cols-2" : "grid-cols-1"}`}>
        <motion.div
          initial={{ opacity: 0, ...(isDesktop ? { x: -10 } : { y: 10 }) }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={getTransition({ delay: STAGGER.slow * 0 })}
        >
          {t("dataContent.rating", { rating: snapshot.rating })}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, ...(isDesktop ? { x: -10 } : { y: 10 }) }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={getTransition({ delay: STAGGER.slow * 1 })}
        >
          {t("dataContent.stars", { stars: snapshot.stars })}
        </motion.div>
        {showPlayCounts ? (
          <>
            <motion.div
              initial={{ opacity: 0, ...(isDesktop ? { x: -10 } : { y: 10 }) }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={getTransition({ delay: STAGGER.slow * 2 })}
            >
              {t("dataContent.versionPlays", { count: snapshot.versionPlayCount })}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, ...(isDesktop ? { x: -10 } : { y: 10 }) }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={getTransition({ delay: STAGGER.slow * 3 })}
            >
              {t("dataContent.totalPlays", { count: snapshot.totalPlayCount })}
            </motion.div>
          </>
        ) : null}
      </div>
    </div>
  );
}

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
    <div className="space-y-4 md:space-y-6">
      <ProfileVisibilityBanner
        visitableProfileAt={visitableProfileAt}
        isOwner={isOwner}
        profileSettingsLoading={ownerSettings.profileSettingsLoading}
        onOpenSettings={ownerSettings.visibility.openSettings}
      />
      <div className="grid gap-4 md:gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:items-start">
        <PlayerIdentitySummary snapshot={snapshot} />
        <PlayerStatisticsBlock snapshot={snapshot} showPlayCounts={showPlayCounts} />
      </div>
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
      <ProfileVisibilityDialog
        profileSettings={ownerSettings.profileSettings}
        profileSettingsLoading={ownerSettings.profileSettingsLoading}
        controller={ownerSettings.visibility}
      />
      <DescriptionDiscardDialog controller={ownerSettings.description} />
      <ConfirmUnpublishDialog controller={ownerSettings.visibility} />
    </div>
  );
}
