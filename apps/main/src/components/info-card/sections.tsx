"use client";

import { ProfilePrivacyFields } from "@/components/profile-privacy-fields";
import { ProfileReportDialog } from "@/components/profile-report-dialog";
import { SettingsField } from "@/components/settings/primitives";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Link } from "@/i18n/navigation";
import { SPRING_CONFIGS, STAGGER, getTransition } from "@/lib/animation-constants";
import { resolveBaseUrl } from "@/lib/base-url";
import { getEnabledRegions } from "@/lib/enabled-regions";
import { VersionId } from "@/lib/metadata";
import { PROFILE_DESCRIPTION_LIMITS } from "@/lib/profile-description";
import { getRatingImageUrl } from "@/lib/rating-calculator";
import type { ProfileSettings, Region, SnapshotWithSongs } from "@/lib/types";
import { createSafeMaimaiImageUrl, isR2Url } from "@/lib/utils";
import {
  MarkdownContent,
  MarkdownEditor,
  measureMarkdown,
  PROFILE_MARKDOWN_POLICY,
  videoEmbedExtension,
  type MarkdownEditorLabels,
} from "@tomomai/markdown";
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
import { Loader2, Pencil, Plus, Settings2 } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import Image from "next/image";

import type { InfoCardOwnerSettings } from "./use-info-card-owner-settings";

const PROFILE_MARKDOWN_EXTENSIONS = [videoEmbedExtension] as const;

type Snapshot = SnapshotWithSongs["snapshot"];

type DescriptionController = InfoCardOwnerSettings["description"];
type VisibilityController = InfoCardOwnerSettings["visibility"];

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

export function ProfileVisibilityBanner({
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

export function PlayerIdentitySummary({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="mb-4 flex items-center gap-2">
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

export function PlayerStatisticsBlock({ snapshot, showPlayCounts }: PlayerStatisticsBlockProps) {
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

interface ProfileAboutSectionProps {
  username: string;
  profileUserId?: string | null;
  canonicalDescription: string | null;
  descriptionDraft: string;
  isDescriptionEditing: boolean;
  isOwner: boolean;
  publishProfile: boolean;
  profileSettingsLoading: boolean;
  onDescriptionDraftChange(value: string): void;
  controller: DescriptionController;
}

export function ProfileAboutSection({
  username,
  profileUserId,
  canonicalDescription,
  descriptionDraft,
  isDescriptionEditing,
  isOwner,
  publishProfile,
  profileSettingsLoading,
  onDescriptionDraftChange,
  controller,
}: ProfileAboutSectionProps) {
  const t = useTranslations();
  const descriptionSize = measureMarkdown(descriptionDraft);
  const editorLabels: MarkdownEditorLabels = {
    formattingToolbar: t("publicProfile.descriptionEditor.editor.formattingToolbar"),
    bold: t("publicProfile.descriptionEditor.editor.bold"),
    italic: t("publicProfile.descriptionEditor.editor.italic"),
    strikethrough: t("publicProfile.descriptionEditor.editor.strikethrough"),
    link: t("publicProfile.descriptionEditor.editor.link"),
    unorderedList: t("publicProfile.descriptionEditor.editor.unorderedList"),
    orderedList: t("publicProfile.descriptionEditor.editor.orderedList"),
    blockquote: t("publicProfile.descriptionEditor.editor.blockquote"),
    media: t("publicProfile.descriptionEditor.editor.media"),
    editorView: t("publicProfile.descriptionEditor.editor.editorView"),
    write: t("publicProfile.descriptionEditor.editor.write"),
    preview: t("publicProfile.descriptionEditor.editor.preview"),
    previewAriaLabel: t("publicProfile.descriptionEditor.editor.previewAriaLabel"),
    linkDialogTitle: t("publicProfile.descriptionEditor.editor.linkDialogTitle"),
    linkDialogDescription: t("publicProfile.descriptionEditor.editor.linkDialogDescription"),
    linkText: t("publicProfile.descriptionEditor.editor.linkText"),
    linkTextPlaceholder: t("publicProfile.descriptionEditor.editor.linkTextPlaceholder"),
    linkUrl: t("publicProfile.descriptionEditor.editor.linkUrl"),
    linkUrlPlaceholder: t("publicProfile.descriptionEditor.editor.linkUrlPlaceholder"),
    invalidHttpsUrl: t("publicProfile.descriptionEditor.editor.invalidHttpsUrl"),
    insertLink: t("publicProfile.descriptionEditor.editor.insertLink"),
    mediaDialogTitle: t("publicProfile.descriptionEditor.editor.mediaDialogTitle"),
    mediaDialogDescription: t("publicProfile.descriptionEditor.editor.mediaDialogDescription"),
    mediaUrl: t("publicProfile.descriptionEditor.editor.mediaUrl"),
    mediaUrlPlaceholder: t("publicProfile.descriptionEditor.editor.mediaUrlPlaceholder"),
    unsupportedMediaUrl: t("publicProfile.descriptionEditor.editor.unsupportedMediaUrl"),
    insertMedia: t("publicProfile.descriptionEditor.editor.insertMedia"),
    cancel: t("publicProfile.descriptionEditor.editor.cancel"),
    formatSizeStatus: (size, limits) =>
      t("publicProfile.descriptionEditor.editor.sizeStatus", {
        characters: size.characters,
        maxCharacters: limits.maxCharacters,
        utf8Bytes: size.utf8Bytes,
        maxUtf8Bytes: limits.maxUtf8Bytes,
      }),
    formatCharacterLimitExceeded: (maxCharacters) =>
      t("publicProfile.descriptionEditor.editor.characterLimitExceeded", { maxCharacters }),
    formatByteLimitExceeded: (maxUtf8Bytes) =>
      t("publicProfile.descriptionEditor.editor.byteLimitExceeded", { maxUtf8Bytes }),
  };

  if (!canonicalDescription && !isOwner) return null;

  return (
    <section aria-labelledby="profile-about-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="profile-about-heading" className="font-medium text-foreground">
          {t("publicProfile.about", { username })}
        </h3>
        {isOwner ? (
          !isDescriptionEditing && !profileSettingsLoading ? (
            <Button type="button" variant="ghost" size="sm" onClick={controller.startEditing}>
              {canonicalDescription ? <Pencil /> : <Plus />}
              {t(
                canonicalDescription
                  ? "publicProfile.descriptionEditor.edit"
                  : "publicProfile.descriptionEditor.add",
              )}
            </Button>
          ) : null
        ) : canonicalDescription && profileUserId ? (
          <ProfileReportDialog
            username={username}
            profileUserId={profileUserId}
            hasProfileDescription={true}
          />
        ) : null}
      </div>

      {isDescriptionEditing ? (
        <div className="space-y-3">
          {!publishProfile ? (
            <p className="text-xs text-muted-foreground">
              {t("publicProfile.descriptionEditor.unpublished")}
            </p>
          ) : null}
          <MarkdownEditor
            id="profile-description"
            ariaLabel={t("publicProfile.descriptionEditor.ariaLabel")}
            placeholder={t("publicProfile.descriptionEditor.placeholder")}
            value={descriptionDraft}
            onChange={onDescriptionDraftChange}
            limits={PROFILE_DESCRIPTION_LIMITS}
            policy={PROFILE_MARKDOWN_POLICY}
            extensions={PROFILE_MARKDOWN_EXTENSIONS}
            disabled={controller.isSaving}
            labels={editorLabels}
          />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>{t("publicProfile.descriptionEditor.disclaimer")}</p>
            <p aria-live="polite" aria-atomic="true">
              {t("publicProfile.descriptionEditor.usage", {
                usedCharacters: descriptionSize.characters,
                maxCharacters: PROFILE_DESCRIPTION_LIMITS.maxCharacters,
                usedBytes: descriptionSize.utf8Bytes,
                maxBytes: PROFILE_DESCRIPTION_LIMITS.maxUtf8Bytes,
              })}
            </p>
          </div>
          {controller.error ? (
            <p role="alert" className="text-sm text-destructive">
              {controller.error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={controller.requestCancel}
              disabled={controller.isSaving}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void controller.save()}
              disabled={controller.isSaving || descriptionDraft === (canonicalDescription ?? "")}
            >
              {controller.isSaving ? (
                <>
                  <Loader2 className="animate-spin" />
                  {t("publicProfile.descriptionEditor.saving")}
                </>
              ) : (
                t("common.save")
              )}
            </Button>
          </div>
        </div>
      ) : canonicalDescription ? (
        <MarkdownContent
          value={canonicalDescription}
          className="max-w-[75ch]"
          policy={PROFILE_MARKDOWN_POLICY}
          extensions={PROFILE_MARKDOWN_EXTENSIONS}
        />
      ) : profileSettingsLoading ? (
        <div className="h-16 animate-pulse rounded-md bg-muted" aria-hidden="true" />
      ) : null}
    </section>
  );
}

interface PrivacySettingsDialogProps {
  profileSettings?: ProfileSettings;
  profileSettingsLoading: boolean;
  controller: VisibilityController;
}

export function PrivacySettingsDialog({
  profileSettings,
  profileSettingsLoading,
  controller,
}: PrivacySettingsDialogProps) {
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

export function DescriptionDiscardDialog({ controller }: { controller: DescriptionController }) {
  const t = useTranslations();

  return (
    <AlertDialog open={controller.confirmDiscardOpen} onOpenChange={controller.setConfirmDiscardOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("publicProfile.descriptionEditor.confirmCancelTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("publicProfile.descriptionEditor.confirmCancelDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("publicProfile.descriptionEditor.keepEditing")}</AlertDialogCancel>
          <AlertDialogAction onClick={controller.discardDraft} variant="destructive">
            {t("publicProfile.descriptionEditor.discard")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
