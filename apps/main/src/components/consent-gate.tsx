"use client";

import { useState } from "react";
import {
  Button,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@tomomai/ui";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc-client";

function dismissKey(versions: { tos: string; privacy: string }) {
  return `consent-gate-skip:${versions.tos}:${versions.privacy}`;
}

function PolicyRow({
  id,
  label,
  content,
  checked,
  onChecked,
  viewFullTextLabel,
}: {
  id: string;
  label: string;
  content: string;
  checked: boolean;
  onChecked: (v: boolean) => void;
  viewFullTextLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChecked(c === true)} />
        <label htmlFor={id} className="text-sm font-semibold cursor-pointer select-none flex-1">
          {label}
        </label>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setExpanded(!expanded)}>
          {viewFullTextLabel}
          {expanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
        </Button>
      </div>
      {expanded && (
        <div className="px-3 pb-3">
          <div className="p-3 bg-muted/60 rounded-md max-h-60 overflow-y-auto">
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{content}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Global post-login consent gate. Re-prompts when the user's accepted policy
 * version is behind the current effective date. Soft (within the grace window)
 * is skippable for the session; hard (grace elapsed) is blocking. Mounted in
 * Dashboard. The per-action gate (passkey, etc.) is enforced separately on the
 * server and prompted imperatively.
 */
export function ConsentGate() {
  const t = useTranslations("consent");
  const utils = trpc.useUtils();
  const { data: pending } = trpc.user.getPendingConsents.useQuery(undefined, {
    staleTime: 60_000,
  });
  const { data: policies } = trpc.user.getPolicies.useQuery(undefined, {
    enabled: !!pending && pending.statuses.some((s) => s.level !== "ok"),
  });
  const acceptMutation = trpc.user.acceptPolicies.useMutation();

  const [tosChecked, setTosChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!pending || !policies) return null;

  const hasHard = pending.blocking;
  const needsAttention = pending.statuses.some((s) => s.level !== "ok");
  if (!needsAttention) return null;

  // Soft prompts can be skipped for the session.
  const skipKey = dismissKey(pending.currentVersions);
  const sessionSkipped =
    typeof window !== "undefined" && window.sessionStorage.getItem(skipKey) === "1";
  if (!hasHard && (dismissed || sessionSkipped)) return null;

  const deadline = pending.statuses.find((s) => s.level === "soft")?.deadline ?? null;
  const canConfirm = tosChecked && privacyChecked;

  const handleAgree = async () => {
    try {
      await acceptMutation.mutateAsync({ versions: pending.currentVersions });
      await utils.user.getPendingConsents.invalidate();
    } catch {
      // Version bumped under us, or transient — refetch and re-render.
      await utils.user.getPendingConsents.invalidate();
    }
  };

  const handleSkip = () => {
    if (typeof window !== "undefined") window.sessionStorage.setItem(skipKey, "1");
    setDismissed(true);
  };

  return (
    <ResponsiveDialog open dismissible={false} onOpenChange={() => {}}>
      <ResponsiveDialogContent
        showCloseButton={false}
        className="max-w-2xl max-h-[90dvh]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("reconsent.title")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t("reconsent.description")}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-2 py-2">
          <PolicyRow
            id="gate-tos"
            label={t("agreeToTos")}
            content={policies.tos.content}
            checked={tosChecked}
            onChecked={setTosChecked}
            viewFullTextLabel={t("viewFullText")}
          />
          <PolicyRow
            id="gate-privacy"
            label={t("agreeToPrivacy")}
            content={policies.privacy.content}
            checked={privacyChecked}
            onChecked={setPrivacyChecked}
            viewFullTextLabel={t("viewFullText")}
          />
          {!hasHard && deadline && (
            <p className="text-xs text-muted-foreground px-1">
              {t("reconsent.reviewBy", { date: deadline })}
            </p>
          )}
        </div>

        <ResponsiveDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleAgree}
            disabled={!canConfirm || acceptMutation.isPending}
            size="lg"
            className="w-full"
          >
            {acceptMutation.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
            {t("reconsent.confirm")}
          </Button>
          {!hasHard && (
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={acceptMutation.isPending}
              className="w-full text-muted-foreground hover:text-foreground"
            >
              {t("reconsent.remindLater")}
            </Button>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
