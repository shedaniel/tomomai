"use client";

import { Button } from "@tomomai/ui";
import { Label } from "@tomomai/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tomomai/ui/select-friendly";
import { Switch } from "@tomomai/ui";
import {
  SettingsField,
  SettingsFooter,
  SettingsForm,
  SettingsHeader,
  useDirtyFlag,
  useSettingsForm,
  useSettingsReset,
  useSettingsSave,
} from "@/components/settings/primitives";
import {
  MarkdownEditor,
  PROFILE_MARKDOWN_POLICY,
  videoEmbedExtension,
} from "@tomomai/markdown";
import { PROFILE_DESCRIPTION_LIMITS } from "@/lib/profile-description";
import { getEnabledRegions } from "@/lib/enabled-regions";
import { trpc } from "@/lib/trpc-client";
import { ProfilePrivacySettings, Region } from "@/lib/types";
import { Copy, ExternalLink, Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

const PROFILE_MARKDOWN_EXTENSIONS = [videoEmbedExtension] as const;

export function PrivacySettings() {
  const t = useTranslations();
  return (
    <SettingsForm>
      <SettingsHeader
        title={t("settings.pages.privacy.title")}
        description={t("settings.pages.privacy.description")}
      />
      <PrivacyFields />
      <SettingsFooter />
    </SettingsForm>
  );
}

function PrivacyFields() {
  const t = useTranslations();
  const { isLoading: isSaving } = useSettingsForm();
  const utils = trpc.useUtils();

  const { data: userData } = trpc.user.getUserData.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const { data: profileSettings, isLoading: profileSettingsLoading } = trpc.user.getProfileSettings.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const username = userData?.username ?? undefined;

  const [selectedPublishProfile, setSelectedPublishProfile] = useState<boolean | null>(null);
  const [selectedMainRegion, setSelectedMainRegion] = useState<Region | null>(null);
  const [selectedPrivacySettings, setSelectedPrivacySettings] = useState<ProfilePrivacySettings | null>(null);
  const [selectedProfileDescription, setSelectedProfileDescription] = useState<string>();

  const effectivePublishProfile = selectedPublishProfile ?? profileSettings?.publishProfile ?? false;
  const effectiveMainRegion = selectedMainRegion ?? profileSettings?.profileMainRegion ?? "intl";
  const effectivePrivacySettings = selectedPrivacySettings ?? {
    profileShowAllScores: profileSettings?.profileShowAllScores ?? true,
    profileShowScoreDetails: profileSettings?.profileShowScoreDetails ?? true,
    profileShowPlates: profileSettings?.profileShowPlates ?? true,
    profileShowPlayCounts: profileSettings?.profileShowPlayCounts ?? true,
    profileShowEvents: profileSettings?.profileShowEvents ?? true,
    profileShowInSearch: profileSettings?.profileShowInSearch ?? true,
  };
  const effectiveProfileDescription = selectedProfileDescription ?? profileSettings?.profileDescription ?? "";

  const updatePublishProfile = trpc.user.updatePublishProfile.useMutation();
  const updateProfileMainRegion = trpc.user.updateProfileMainRegion.useMutation();
  const updateProfilePrivacySettings = trpc.user.updateProfilePrivacySettings.useMutation();

  const updateProfileDescription = trpc.user.updateProfileDescription.useMutation();
  const publishDirty = !!profileSettings && effectivePublishProfile !== profileSettings.publishProfile;
  const regionDirty = !!profileSettings && effectiveMainRegion !== profileSettings.profileMainRegion;
  const privacyDirty = !!profileSettings && (
    effectivePrivacySettings.profileShowAllScores !== profileSettings.profileShowAllScores ||
    effectivePrivacySettings.profileShowScoreDetails !== profileSettings.profileShowScoreDetails ||
    effectivePrivacySettings.profileShowPlates !== profileSettings.profileShowPlates ||
    effectivePrivacySettings.profileShowPlayCounts !== profileSettings.profileShowPlayCounts ||
    effectivePrivacySettings.profileShowEvents !== profileSettings.profileShowEvents ||
    effectivePrivacySettings.profileShowInSearch !== profileSettings.profileShowInSearch
  );
  const descriptionDirty = !!profileSettings && effectiveProfileDescription !== (profileSettings.profileDescription ?? "");

  useDirtyFlag("privacy", publishDirty || regionDirty || privacyDirty);
  useDirtyFlag("privacy.profileDescription", descriptionDirty);

  useSettingsSave("privacy", async () => {
    if (!profileSettings) return;
    const promises: Promise<unknown>[] = [];
    if (publishDirty) promises.push(updatePublishProfile.mutateAsync({ publishProfile: effectivePublishProfile }));
    if (regionDirty) promises.push(updateProfileMainRegion.mutateAsync({ profileMainRegion: effectiveMainRegion }));
    if (privacyDirty) promises.push(updateProfilePrivacySettings.mutateAsync(effectivePrivacySettings));
    await Promise.all(promises);
  });

  useSettingsReset("privacy", () => {
    setSelectedPublishProfile(null);
    setSelectedMainRegion(null);
    setSelectedPrivacySettings(null);
  });

  useSettingsSave("privacy.profileDescription", async () => {
    if (!profileSettings || !descriptionDirty) return;

    const normalizedDescription = effectiveProfileDescription.trim() || null;
    await updateProfileDescription.mutateAsync({ profileDescription: normalizedDescription });
    utils.user.getProfileSettings.setData(undefined, (current) => current
      ? { ...current, profileDescription: normalizedDescription }
      : current);
    setSelectedProfileDescription(undefined);
  });

  useSettingsReset("privacy.profileDescription", () => {
    setSelectedProfileDescription(undefined);
  });

  const getProfileUrl = () => {
    if (!username) return "";
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}/profile/${username}`;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(getProfileUrl());
      toast.success(t("settings.profile.url.copied"));
    } catch {
      toast.error(t("settings.profile.url.copyFailed"));
    }
  };

  const openProfile = () => {
    window.open(getProfileUrl(), "_blank");
  };

  const updatePrivacySetting = (key: keyof ProfilePrivacySettings, value: boolean) => {
    setSelectedPrivacySettings((prev) => ({
      ...(prev ?? effectivePrivacySettings),
      [key]: value,
    }));
  };

  const isLoadingSettings = profileSettingsLoading;

  return (
    <div className="grid gap-6">
      <SettingsField
        layout="inline"
        icon={Globe}
        label={t("settings.profile.publishProfile")}
        description={t("settings.profile.publishDescription")}
        htmlFor="publish-profile"
        action={
          <Switch
            id="publish-profile"
            checked={effectivePublishProfile}
            onCheckedChange={(v) => setSelectedPublishProfile(v)}
            disabled={isLoadingSettings}
          />
        }
      />

      <SettingsField
        label={t("settings.profile.description.label")}
        description={t("settings.profile.description.description")}
        htmlFor="profile-description"
      >
        <div className="space-y-2">
          {!effectivePublishProfile && (
            <p className="text-xs text-muted-foreground">
              {t("settings.profile.description.unpublished")}
            </p>
          )}
          <MarkdownEditor
            id="profile-description"
            ariaLabel={t("settings.profile.description.label")}
            value={effectiveProfileDescription}
            onChange={setSelectedProfileDescription}
            limits={PROFILE_DESCRIPTION_LIMITS}
            policy={PROFILE_MARKDOWN_POLICY}
            extensions={PROFILE_MARKDOWN_EXTENSIONS}
            disabled={profileSettingsLoading || isSaving}
          />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>{t("settings.profile.description.formats")}</p>
            <p>
              {t("settings.profile.description.limits", {
                characters: PROFILE_DESCRIPTION_LIMITS.maxCharacters,
                bytes: PROFILE_DESCRIPTION_LIMITS.maxUtf8Bytes,
              })}
            </p>
          </div>
        </div>
      </SettingsField>

      {effectivePublishProfile && (
        <div className="grid gap-4 pl-4 border-l-2 border-muted">
          {getEnabledRegions().length > 1 && (
            <SettingsField
              label={t("settings.profile.mainRegion.label")}
              description={t("settings.profile.mainRegion.description")}
              htmlFor="main-region"
            >
              <Select
                value={effectiveMainRegion}
                onValueChange={(value: Region) => setSelectedMainRegion(value)}
                disabled={isLoadingSettings}
              >
                <SelectTrigger id="main-region" className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getEnabledRegions().map((region) => (
                    <SelectItem key={region} value={region}>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono bg-muted px-1 py-0.5 rounded">{region.toUpperCase()}</span>
                        <span>{t(`settings.profile.mainRegion.${region}`)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsField>
          )}

          <div className="grid gap-3">
            <Label>{t("settings.profile.privacy.label")}</Label>
            <div className="grid gap-3">
              {(
                [
                  ["profileShowAllScores", "showAllScores"],
                  ["profileShowScoreDetails", "showScoreDetails"],
                  ["profileShowPlates", "showPlates"],
                  ["profileShowPlayCounts", "showPlayCounts"],
                  ["profileShowEvents", "showEvents"],
                  ["profileShowInSearch", "showInSearch"],
                ] as const
              ).map(([key, tKey]) => (
                <SettingsField
                  key={key}
                  layout="inline"
                  label={t(`settings.profile.privacy.${tKey}.label`)}
                  description={t(`settings.profile.privacy.${tKey}.description`)}
                  labelClassName="text-sm font-normal"
                  action={
                    <Switch
                      checked={effectivePrivacySettings[key]}
                      onCheckedChange={(checked) => updatePrivacySetting(key, checked)}
                      disabled={isLoadingSettings}
                    />
                  }
                />
              ))}
            </div>
          </div>

          {username && (
            <SettingsField
              label={t("settings.profile.url.label")}
              description={t("settings.profile.url.description")}
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 p-2 bg-muted rounded-md text-sm font-mono text-muted-foreground break-all">
                  {getProfileUrl()}
                </div>
                <Button variant="outline" size="sm" onClick={copyToClipboard} className="shrink-0">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={openProfile} className="shrink-0">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </SettingsField>
          )}
        </div>
      )}
    </div>
  );
}
