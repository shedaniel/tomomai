"use client";

import { Link } from "@/i18n/navigation";
import { useSession } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc-client";
import {
  Button,
  Label,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  Textarea,
} from "@tomomai/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tomomai/ui/select-friendly";
import { Flag, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

const PROFILE_REPORT_REASONS = [
  "harassment",
  "hate",
  "sexual",
  "violence",
  "spam",
  "impersonation",
  "other",
] as const;

type ProfileReportReason = (typeof PROFILE_REPORT_REASONS)[number];

interface ProfileReportDialogProps {
  username: string;
  profileUserId: string;
  hasProfileDescription: boolean;
}

export function ProfileReportDialog({
  username,
  profileUserId,
  hasProfileDescription,
}: ProfileReportDialogProps) {
  const t = useTranslations();
  const { data: session, isPending: isSessionPending } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ProfileReportReason>();
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string>();

  const submitReport = trpc.user.submitProfileReport.useMutation({
    onSuccess: () => {
      setOpen(false);
      setReason(undefined);
      setDetails("");
      setError(undefined);
      toast(t("profileReport.success"));
    },
    onError: (mutationError) => {
      setError(mutationError.message || t("profileReport.error"));
    },
  });

  const isProfileOwner = session?.user.id === profileUserId;
  const canSubmit = !!reason && !submitReport.isPending;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && !submitReport.isPending) {
      setReason(undefined);
      setDetails("");
      setError(undefined);
    }
  }

  function handleSubmit() {
    if (!reason || submitReport.isPending) return;
    setError(undefined);
    submitReport.mutate({
      username,
      reason,
      details: details.trim() || undefined,
    });
  }

  if (isSessionPending || isProfileOwner || !hasProfileDescription) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Flag />
        {t("profileReport.trigger")}
      </Button>

      <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
        <ResponsiveDialogContent className="sm:max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t("profileReport.title", { username })}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {session
                ? t("profileReport.description")
                : t("profileReport.signInDescription")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          {session ? (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmit();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="profile-report-reason">
                  {t("profileReport.reasonLabel")}
                </Label>
                <Select
                  value={reason}
                  onValueChange={(value) => {
                    setReason(value as ProfileReportReason);
                    setError(undefined);
                  }}
                  disabled={submitReport.isPending}
                >
                  <SelectTrigger id="profile-report-reason" className="w-full bg-background">
                    <SelectValue placeholder={t("profileReport.reasonLabel")} />
                  </SelectTrigger>
                  <SelectContent label={t("profileReport.reasonLabel")}>
                    {PROFILE_REPORT_REASONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`profileReport.reasons.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-report-details">
                  {t("profileReport.detailsLabel")}
                </Label>
                <Textarea
                  id="profile-report-details"
                  value={details}
                  onChange={(event) => {
                    setDetails(event.target.value);
                    setError(undefined);
                  }}
                  placeholder={t("profileReport.detailsPlaceholder")}
                  maxLength={1000}
                  rows={4}
                  disabled={submitReport.isPending}
                  aria-invalid={!!error}
                  aria-describedby={error ? "profile-report-error" : undefined}
                />
              </div>

              {error ? (
                <p
                  id="profile-report-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}

              <ResponsiveDialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={submitReport.isPending}
                >
                  {t("profileReport.cancel")}
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {submitReport.isPending ? (
                    <>
                      <Loader2 className="animate-spin" />
                      {t("profileReport.submit")}
                    </>
                  ) : (
                    t("profileReport.submit")
                  )}
                </Button>
              </ResponsiveDialogFooter>
            </form>
          ) : (
            <ResponsiveDialogFooter>
              <Button asChild>
                <Link href="/">{t("profileReport.signInAction")}</Link>
              </Button>
            </ResponsiveDialogFooter>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
