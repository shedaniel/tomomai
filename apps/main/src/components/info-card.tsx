"use client";


import { ProfileReportDialog } from "@/components/profile-report-dialog";
import { getRatingImageUrl } from "@/lib/rating-calculator";
import { SnapshotWithSongs } from "@/lib/types";
import { createSafeMaimaiImageUrl, isR2Url } from "@/lib/utils";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation"
import { motion } from "motion/react";
import { SPRING_CONFIGS, STAGGER, getTransition } from "@/lib/animation-constants";
import { useMediaQuery } from "@/hooks/use-media-query";
import { VersionId } from "@/lib/metadata";
import { resolveBaseUrl } from "@/lib/base-url";
import {
  MarkdownContent,
  MarkdownEditor,
  measureMarkdown,
  PROFILE_MARKDOWN_POLICY,
  videoEmbedExtension,
  type MarkdownEditorLabels,
} from "@tomomai/markdown";
import { PROFILE_DESCRIPTION_LIMITS } from "@/lib/profile-description";
import { trpc } from "@/lib/trpc-client";
import type { ProfilePrivacySettings, ProfileSettings, Region } from "@/lib/types";
import { ProfilePrivacyFields, PROFILE_PRIVACY_FIELDS } from "@/components/profile-privacy-fields";
import { SettingsField } from "@/components/settings/primitives";
import { getEnabledRegions } from "@/lib/enabled-regions";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
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

const PROFILE_MARKDOWN_EXTENSIONS = [videoEmbedExtension] as const;

function RatingImage({ rating, version }: { rating: number; version?: VersionId }) {
  return (
    <Image src={getRatingImageUrl(rating, version)} alt={rating.toString()} width={120} height={35} crossOrigin="anonymous" />
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

type VisibilityDraft = {
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
  const t = useTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();
  const isDesktop = useMediaQuery("(min-width: 768px)", { initializeWithValue: false });
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

  const { snapshot } = selectedSnapshotData;
  const canonicalDescription = profileSettings?.profileDescription ?? profileDescription ?? null;
  const aboutUsername = profileUsername ?? snapshot.displayName;
  const descriptionSize = measureMarkdown(descriptionDraft);
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

  return (
    <div className="space-y-6">
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
              onClick={openVisibilitySettings}
              disabled={profileSettingsLoading}
              className="shrink-0 self-center"
            >
              <Settings2 />
              {t("publicProfile.visibilitySettings.trigger")}
            </Button>
          ) : null}
        </div>
      </div>


      <div className="mb-4 flex items-center gap-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={getTransition(SPRING_CONFIGS.default)}
        >
          <Image src={createSafeMaimaiImageUrl(snapshot.iconUrl)} unoptimized={isR2Url(snapshot.iconUrl)} alt={snapshot.title} width={80} height={80} />
        </motion.div>
        <div className="my-1 flex min-w-0 self-stretch flex-col items-stretch space-y-0.5">
          <span className="inset-shadow-sm truncate rounded-full bg-secondary px-6 py-1 text-center text-sm text-secondary-foreground">{snapshot.title}</span>
          <span className="flex items-center self-center text-lg font-medium max-xs:flex-col">
            <span className="mx-4 flex-1 whitespace-nowrap max-2xs:text-sm max-xs:text-md">{snapshot.displayName}</span>
            <div className="relative h-[35px] w-[120px] min-w-fit shrink-0 grow-0">
              <RatingImage rating={snapshot.rating} version={snapshot.gameVersion} />
              <span className="absolute top-[3px] left-[8px] box-border w-[106px] text-right font-mono text-[18px] font-normal tracking-[1.65px] text-white">{snapshot.rating}</span>
            </div>
          </span>
        </div>
      </div>
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

      {canonicalDescription || isOwner ? (
        <section aria-labelledby="profile-about-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id="profile-about-heading" className="font-medium text-foreground">
              {t("publicProfile.about", { username: aboutUsername })}
            </h3>
            {isOwner ? (
              !isDescriptionEditing && !profileSettingsLoading ? (
                <Button type="button" variant="ghost" size="sm" onClick={startEditingDescription}>
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
                username={aboutUsername}
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
                disabled={updateProfileDescription.isPending}
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
              {descriptionError ? (
                <p role="alert" className="text-sm text-destructive">
                  {descriptionError}
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={requestCancelDescription}
                  disabled={updateProfileDescription.isPending}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={() => void saveDescription()}
                  disabled={
                    updateProfileDescription.isPending ||
                    descriptionDraft === (canonicalDescription ?? "")
                  }
                >
                  {updateProfileDescription.isPending ? (
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
      ) : null}

      <ResponsiveDialog open={visibilityOpen} onOpenChange={handleVisibilityOpenChange}>
        <ResponsiveDialogContent className="sm:max-w-xl">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("publicProfile.visibilitySettings.title")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("publicProfile.visibilitySettings.description")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          {profileSettingsLoading || !profileSettings || !visibilityDraft ? (
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
                    checked={visibilityDraft.publishProfile}
                    onCheckedChange={(checked) =>
                      setVisibilityDraft((current) =>
                        current ? { ...current, publishProfile: checked } : current,
                      )
                    }
                    disabled={visibilitySaving}
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
                    value={visibilityDraft.profileMainRegion}
                    onValueChange={(value: Region) =>
                      setVisibilityDraft((current) =>
                        current ? { ...current, profileMainRegion: value } : current,
                      )
                    }
                    disabled={visibilitySaving}
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
                  value={visibilityDraft.privacySettings}
                  onChange={(nextPrivacySettings) =>
                    setVisibilityDraft((current) =>
                      current ? { ...current, privacySettings: nextPrivacySettings } : current,
                    )
                  }
                  disabled={visibilitySaving}
                  idPrefix="inline-profile-privacy"
                />
              </div>

              {visibilityError ? (
                <p role="alert" className="text-sm text-destructive">
                  {visibilityError}
                </p>
              ) : null}
            </div>
          )}

          <ResponsiveDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setVisibilityOpen(false)}
              disabled={visibilitySaving}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={requestSaveVisibility}
              disabled={
                !profileSettings ||
                !visibilityDraft ||
                visibilitySaving ||
                !visibilityIsDirty(visibilityDraft, profileSettings)
              }
            >
              {visibilitySaving ? (
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

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("publicProfile.descriptionEditor.confirmCancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("publicProfile.descriptionEditor.confirmCancelDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("publicProfile.descriptionEditor.keepEditing")}</AlertDialogCancel>
            <AlertDialogAction onClick={discardDescriptionDraft} variant="destructive">
              {t("publicProfile.descriptionEditor.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmUnpublishOpen} onOpenChange={setConfirmUnpublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("publicProfile.visibilitySettings.confirmUnpublishTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("publicProfile.visibilitySettings.confirmUnpublishDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("publicProfile.visibilitySettings.keepPublic")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void saveVisibilitySettings()} variant="destructive">
              {t("publicProfile.visibilitySettings.confirmUnpublish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
