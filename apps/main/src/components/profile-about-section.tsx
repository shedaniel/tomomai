"use client";

import { PROFILE_DESCRIPTION_LIMITS } from "@/lib/profile-description";
import {
  createVideoEmbedExtension,
  MarkdownContent,
  measureMarkdown,
  PROFILE_MARKDOWN_POLICY,
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
} from "@tomomai/ui";
import { Loader2, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useMemo } from "react";

// Both are owner-only or visitor-only surfaces, so they stay out of the chunk
// every profile visitor downloads.
const MarkdownEditor = dynamic(
  () => import("@tomomai/markdown/editor").then((m) => m.MarkdownEditor),
  {
    ssr: false,
    loading: () => <div className="h-48 animate-pulse rounded-md bg-muted" aria-hidden="true" />,
  },
);

const ProfileReportDialog = dynamic(
  () => import("@/components/profile-report-dialog").then((m) => m.ProfileReportDialog),
  { ssr: false },
);

export interface DescriptionController {
  confirmDiscardOpen: boolean;
  error?: string;
  isSaving: boolean;
  setConfirmDiscardOpen(open: boolean): void;
  startEditing(): void;
  requestCancel(): void;
  discardDraft(): void;
  save(): Promise<void>;
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
  const extensions = useMemo(
    () => [
      createVideoEmbedExtension({
        loadVideo: t("publicProfile.descriptionEditor.editor.loadVideo"),
        formatRegionLabel: (provider) =>
          t("publicProfile.descriptionEditor.editor.videoRegionLabel", { provider }),
      }),
    ],
    [t],
  );
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
            extensions={extensions}
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
          extensions={extensions}
        />
      ) : profileSettingsLoading ? (
        <div className="h-16 animate-pulse rounded-md bg-muted" aria-hidden="true" />
      ) : !isOwner ? (
        <p className="max-w-[75ch] text-sm text-muted-foreground">
          {t("publicProfile.emptyDescription")}
        </p>
      ) : null}
    </section>
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
