"use client";

import { ProfilePrivacyFields } from "@/components/profile-privacy-fields";
import { SettingsField } from "@/components/settings/primitives";
import { getEnabledRegions } from "@/lib/enabled-regions";
import type { ProfilePrivacySettings, ProfileSettings, Region } from "@/lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Label,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  Switch,
} from "@tomomai/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tomomai/ui/select-friendly";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Dispatch, SetStateAction } from "react";

export type VisibilityDraft = {
  publishProfile: boolean;
  profileMainRegion: Region;
  privacySettings: ProfilePrivacySettings;
};

export interface VisibilityController {
  confirmUnpublishOpen: boolean;
  draft?: VisibilityDraft;
  error?: string;
  isOpen: boolean;
  isSaving: boolean;
  setConfirmUnpublishOpen(open: boolean): void;
  setDraft: Dispatch<SetStateAction<VisibilityDraft | undefined>>;
  openSettings(): void;
  close(): void;
  handleOpenChange(open: boolean): void;
  requestSave(): void;
  save(): Promise<void>;
  isDirty(draft: VisibilityDraft, settings: ProfileSettings): boolean;
}

interface ProfileVisibilityDialogProps {
  profileSettings?: ProfileSettings;
  profileSettingsLoading: boolean;
  controller: VisibilityController;
}

export function ProfileVisibilityDialog({
  profileSettings,
  profileSettingsLoading,
  controller,
}: ProfileVisibilityDialogProps) {
  const t = useTranslations();

  return (
    <ResponsiveDialog open={controller.isOpen} onOpenChange={controller.handleOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("publicProfile.visibilitySettings.title")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("publicProfile.visibilitySettings.description")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {profileSettingsLoading || !profileSettings || !controller.draft ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" />
            {t("publicProfile.visibilitySettings.loading")}
          </div>
        ) : (
          <div className="grid gap-5 py-2">
            <SettingsField
              layout="inline"
              htmlFor="inline-publish-profile"
              label={t("settings.profile.publishProfile")}
              description={t("settings.profile.publishDescription")}
              action={
                <Switch
                  id="inline-publish-profile"
                  checked={controller.draft.publishProfile}
                  onCheckedChange={(checked) =>
                    controller.setDraft((current) =>
                      current ? { ...current, publishProfile: checked } : current,
                    )
                  }
                  disabled={controller.isSaving}
                />
              }
            />

            {getEnabledRegions().length > 1 ? (
              <SettingsField
                label={t("settings.profile.mainRegion.label")}
                description={t("settings.profile.mainRegion.description")}
                htmlFor="inline-profile-main-region"
              >
                <Select
                  value={controller.draft.profileMainRegion}
                  onValueChange={(value: Region) =>
                    controller.setDraft((current) =>
                      current ? { ...current, profileMainRegion: value } : current,
                    )
                  }
                  disabled={controller.isSaving}
                >
                  <SelectTrigger id="inline-profile-main-region" className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getEnabledRegions().map((enabledRegion) => (
                      <SelectItem key={enabledRegion} value={enabledRegion}>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                            {enabledRegion.toUpperCase()}
                          </span>
                          <span>{t(`settings.profile.mainRegion.${enabledRegion}`)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsField>
            ) : null}

            <div className="grid gap-3">
              <Label>{t("settings.profile.privacy.label")}</Label>
              <ProfilePrivacyFields
                value={controller.draft.privacySettings}
                onChange={(nextPrivacySettings) =>
                  controller.setDraft((current) =>
                    current ? { ...current, privacySettings: nextPrivacySettings } : current,
                  )
                }
                disabled={controller.isSaving}
                idPrefix="inline-profile-privacy"
              />
            </div>

            {controller.error ? (
              <p role="alert" className="text-sm text-destructive">
                {controller.error}
              </p>
            ) : null}
          </div>
        )}

        <ResponsiveDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={controller.close}
            disabled={controller.isSaving}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={controller.requestSave}
            disabled={
              !profileSettings ||
              !controller.draft ||
              controller.isSaving ||
              !controller.isDirty(controller.draft, profileSettings)
            }
          >
            {controller.isSaving ? (
              <>
                <Loader2 className="animate-spin" />
                {t("publicProfile.visibilitySettings.saving")}
              </>
            ) : (
              t("common.save")
            )}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

export function ConfirmUnpublishDialog({ controller }: { controller: VisibilityController }) {
  const t = useTranslations();

  return (
    <AlertDialog open={controller.confirmUnpublishOpen} onOpenChange={controller.setConfirmUnpublishOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("publicProfile.visibilitySettings.confirmUnpublishTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("publicProfile.visibilitySettings.confirmUnpublishDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("publicProfile.visibilitySettings.keepPublic")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void controller.save()} variant="destructive">
            {t("publicProfile.visibilitySettings.confirmUnpublish")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
