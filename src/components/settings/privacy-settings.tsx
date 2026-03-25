"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select-friendly";
import { Switch } from "@/components/ui/switch";
import { getEnabledRegions } from "@/lib/enabled-regions";
import { trpc } from "@/lib/trpc-client";
import { ProfilePrivacySettings, Region } from "@/lib/types";
import { Copy, ExternalLink, Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

export function PrivacySettings() {
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(false);

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

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const promises: Promise<void>[] = [];

      if (profileSettings) {
        if (effectivePublishProfile !== profileSettings.publishProfile) {
          promises.push(updatePublishProfile.mutateAsync({ publishProfile: effectivePublishProfile }).then(() => {}));
        }
        if (effectiveMainRegion !== profileSettings.profileMainRegion) {
          promises.push(updateProfileMainRegion.mutateAsync({ profileMainRegion: effectiveMainRegion }).then(() => {}));
        }
        const privacyChanged =
          effectivePrivacySettings.profileShowAllScores !== profileSettings.profileShowAllScores ||
          effectivePrivacySettings.profileShowScoreDetails !== profileSettings.profileShowScoreDetails ||
          effectivePrivacySettings.profileShowPlates !== profileSettings.profileShowPlates ||
          effectivePrivacySettings.profileShowPlayCounts !== profileSettings.profileShowPlayCounts ||
          effectivePrivacySettings.profileShowEvents !== profileSettings.profileShowEvents ||
          effectivePrivacySettings.profileShowInSearch !== profileSettings.profileShowInSearch;
        if (privacyChanged) {
          promises.push(updateProfilePrivacySettings.mutateAsync(effectivePrivacySettings).then(() => {}));
        }
      }

      await Promise.all(promises);
      toast.success(t("settings.saved"));
    } catch (error) {
      console.error("Failed to update settings:", error);
      toast.error(t("settings.errorSaving"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedPublishProfile(null);
    setSelectedMainRegion(null);
    setSelectedPrivacySettings(null);
  };

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

  const isLoadingSettings = profileSettingsLoading || isLoading;

  return (
    <div className="">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">{t("settings.pages.privacy.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.pages.privacy.description")}</p>
      </div>

      <div className="grid gap-6">
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="publish-profile" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              {t("settings.profile.publishProfile")}
            </Label>
            <Switch
              id="publish-profile"
              checked={effectivePublishProfile}
              onCheckedChange={(v) => setSelectedPublishProfile(v)}
              disabled={isLoadingSettings}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.profile.publishDescription")}</p>
        </div>

        {effectivePublishProfile && (
          <div className="grid gap-4 pl-4 border-l-2 border-muted">
            {getEnabledRegions().length > 1 && (
              <div className="grid gap-2">
                <Label htmlFor="main-region">{t("settings.profile.mainRegion.label")}</Label>
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
                <p className="text-xs text-muted-foreground">{t("settings.profile.mainRegion.description")}</p>
              </div>
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
                  <div key={key} className="flex items-center justify-between">
                    <div className="grid gap-1">
                      <Label className="text-sm font-normal">{t(`settings.profile.privacy.${tKey}.label`)}</Label>
                      <p className="text-xs text-muted-foreground">{t(`settings.profile.privacy.${tKey}.description`)}</p>
                    </div>
                    <Switch
                      checked={effectivePrivacySettings[key]}
                      onCheckedChange={(checked) => updatePrivacySetting(key, checked)}
                      disabled={isLoadingSettings}
                    />
                  </div>
                ))}
              </div>
            </div>

            {username && (
              <div className="grid gap-2">
                <Label>{t("settings.profile.url.label")}</Label>
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
                <p className="text-xs text-muted-foreground">{t("settings.profile.url.description")}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end space-x-2 mt-10 border-t pt-6">
        <Button variant="outline" onClick={handleReset} disabled={isLoadingSettings}>
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSave} disabled={isLoadingSettings}>
          {isLoadingSettings ? t("settings.saving") : t("settings.saveChanges")}
        </Button>
      </div>
    </div>
  );
}
