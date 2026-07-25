"use client";

import { PROFILE_PRIVACY_FIELDS } from "@/components/profile-privacy-fields";
import type { ProfilePrivacySettings, ProfileSettings, Region } from "@/lib/types";
import { trpc } from "@/lib/trpc-client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export type VisibilityDraft = {
  publishProfile: boolean;
  profileMainRegion: Region;
  privacySettings: ProfilePrivacySettings;
};

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

export function useInfoCardOwnerSettings({
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

export type InfoCardOwnerSettings = ReturnType<typeof useInfoCardOwnerSettings>;
