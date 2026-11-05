"use client";

import { Button, Label } from "@tomomai/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tomomai/ui/select-friendly";
import {
  SettingsField,
  SettingsFooter,
  SettingsForm,
  SettingsHeader,
  useDirtyFlag,
  useSettingsReset,
  useSettingsSave,
} from "@/components/settings/primitives";
import { ProfilePrivacyFields, ProfileVisibilityField, profileAudiencesEqual, profileAudiencesOf } from "@/components/profile-privacy-fields";
import { useGame } from "@/components/providers/game-provider";
import { getGameRegion, isGameRegion } from "@/lib/games/frontend";
import { trpc } from "@/lib/trpc-client";
import { DEFAULT_PROFILE_AUDIENCES, type ProfileAudienceSettings } from "@/lib/profile-audience";
import type { Region } from "@/lib/games/ids";
import { Copy, ExternalLink } from "lucide-react";
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
  const game = useGame();

  const { data: userData } = trpc.user.getUserData.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const { data: profileSettings, isLoading: profileSettingsLoading } = trpc.user.getProfileSettings.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const username = userData?.username ?? undefined;

  const [selectedMainRegion, setSelectedMainRegion] = useState<Region | null>(null);
  const [selectedAudiences, setSelectedAudiences] = useState<ProfileAudienceSettings | null>(null);

  const savedAudiences = profileSettings ? profileAudiencesOf(profileSettings) : DEFAULT_PROFILE_AUDIENCES;
  const audiences = selectedAudiences ?? savedAudiences;
  const effectiveMainRegion = getGameRegion(game, selectedMainRegion ?? profileSettings?.profileMainRegion);

  const updateProfileMainRegion = trpc.user.updateProfileMainRegion.useMutation();
  const updateProfilePrivacySettings = trpc.user.updateProfilePrivacySettings.useMutation();

  const regionDirty = !!profileSettings && selectedMainRegion !== null && selectedMainRegion !== profileSettings.profileMainRegion;
  const privacyDirty = !!profileSettings && !profileAudiencesEqual(audiences, savedAudiences);

  useDirtyFlag("privacy", regionDirty || privacyDirty);

  useSettingsSave("privacy", async () => {
    if (!profileSettings) return;
    const promises: Promise<unknown>[] = [];
    if (regionDirty && effectiveMainRegion) promises.push(updateProfileMainRegion.mutateAsync({ profileMainRegion: effectiveMainRegion }));
    if (privacyDirty) promises.push(updateProfilePrivacySettings.mutateAsync(audiences));
    await Promise.all(promises);
  });

  useSettingsReset("privacy", () => {
    setSelectedMainRegion(null);
    setSelectedAudiences(null);
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
      <ProfileVisibilityField
        value={audiences.profileVisibility}
        onChange={profileVisibility => setSelectedAudiences({ ...audiences, profileVisibility })}
        disabled={isLoadingSettings}
      />

      {audiences.profileVisibility !== "private" && (
        <div className="grid gap-4 pl-4 border-l-2 border-muted">
          {game.regions.length > 1 && (
            <SettingsField
              label={t("settings.profile.mainRegion.label")}
              description={t("settings.profile.mainRegion.description", { game: game.brand.displayName })}
              htmlFor="main-region"
            >
              <Select
                value={effectiveMainRegion ?? undefined}
                onValueChange={value => { if (isGameRegion(game, value)) setSelectedMainRegion(value); }}
                disabled={isLoadingSettings}
              >
                <SelectTrigger id="main-region" className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {game.regions.map((region) => (
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
              value={audiences}
              onChange={setSelectedAudiences}
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
