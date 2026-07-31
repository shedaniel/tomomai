"use client";

import { Button, Label } from "@tomomai/ui";
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
  useSettingsReset,
  useSettingsSave,
} from "@/components/settings/primitives";
import { ProfilePrivacyFields } from "@/components/profile-privacy-fields";
import { getEnabledRegions } from "@/lib/enabled-regions";
import { trpc } from "@/lib/trpc-client";
import { ProfilePrivacySettings, Region } from "@/lib/types";
import { Copy, ExternalLink, Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";


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

  const updatePublishProfile = trpc.user.updatePublishProfile.useMutation();
  const updateProfileMainRegion = trpc.user.updateProfileMainRegion.useMutation();
  const updateProfilePrivacySettings = trpc.user.updateProfilePrivacySettings.useMutation();

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

  useDirtyFlag("privacy", publishDirty || regionDirty || privacyDirty);

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
            <ProfilePrivacyFields
              value={effectivePrivacySettings}
              onChange={setSelectedPrivacySettings}
              disabled={isLoadingSettings}
              idPrefix="settings-profile-privacy"
            />
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
