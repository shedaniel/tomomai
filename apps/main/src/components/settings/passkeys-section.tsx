"use client";

import { useState } from "react";
import { Button, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@tomomai/ui";
import { SettingsField } from "@/components/settings/primitives";
import { AltchaWidget } from "@/components/altcha-widget";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient, armCaptchaForPath } from "@/lib/auth-client";
import { useReauthGuard } from "@/lib/security/use-reauth-guard";
import { useNewPolicyGuard } from "@/lib/security/use-new-policy-guard";
import { composeGuards } from "@/lib/security/compose-guards";
import { toast } from "sonner";

type Passkey = {
  id: string;
  name: string | null;
  createdAt: Date;
  deviceType: string;
};

function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function PasskeysSection() {
  const t = useTranslations("passkeys");
  const tc = useTranslations("common");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [showAltcha, setShowAltcha] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: passkeys, isLoading } = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const res = await fetch("/api/auth/passkey/list-user-passkeys", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch passkeys");
      return res.json() as Promise<Passkey[]>;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await authClient.passkey.deletePasskey({ id });
      if (result.error) throw new Error(result.error.message);
    },
    ...useReauthGuard({
      callbackURL: "/settings",
      reauthMessage: t("reauthRequired"),
      fallback: t("deleteError"),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
      toast.success(t("deleteSuccess"));
      setDeleteId(null);
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: string) => {
      armCaptchaForPath("/passkey/generate-register-options", payload);
      const result = await authClient.passkey.addPasskey();
      if (result?.error) throw new Error(result.error.message || t("addError"));
    },
    // Policy guard first (accept the new TOS/PP without navigating away), then
    // the fresh-session reauth bounce. The server (auth.ts) also enforces this.
    ...composeGuards(
      useNewPolicyGuard({ required: { tos: "20260630", privacy: "20260630" } }),
      useReauthGuard({
        callbackURL: "/settings",
        reauthMessage: t("reauthRequired"),
        fallback: t("addError"),
      }),
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
      toast.success(t("addSuccess"));
    },
  });

  const handleAddPasskeyClick = () => {
    setShowAltcha(true);
  };

  const handleAltchaSolve = async (payload: string) => {
    setShowAltcha(false);
    setAddingPasskey(true);
    try {
      await addMutation.mutateAsync(payload);
    } finally {
      setAddingPasskey(false);
    }
  };

  const handleAltchaError = () => {
    toast.error(t("captchaFailed"));
    setShowAltcha(false);
  };

  return (
    <div className="grid gap-4">
      <SettingsField
        layout="inline"
        icon={KeyRound}
        label={t("title")}
        description={t("description")}
        action={
          !showAltcha ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddPasskeyClick}
              disabled={addingPasskey}
            >
              {addingPasskey ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("addingPasskey")}
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4 mr-2" />
                  {t("addPasskey")}
                </>
              )}
            </Button>
          ) : null
        }
      />

      {showAltcha && (
        <div className="flex flex-col items-center gap-3 p-4 rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">{t("verifyingCaptcha")}</p>
          <AltchaWidget onSolve={handleAltchaSolve} onError={handleAltchaError} className="w-full" />
          <Button variant="ghost" size="sm" onClick={() => setShowAltcha(false)}>
            {tc("cancel")}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tc("loading")}
        </div>
      ) : !passkeys || passkeys.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 rounded-md border border-dashed text-center">
          <KeyRound className="h-7 w-7 opacity-40" />
          <p className="text-sm text-muted-foreground">{t("noPasskeys")}</p>
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {passkeys.map((pk, i) => (
            <div key={pk.id} className="flex items-center gap-3 px-4 py-3">
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {pk.name ?? t("passkeyName", { index: i + 1 })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pk.deviceType} · {formatDate(pk.createdAt, locale)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteId(pk.id)}
                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("deletePasskey")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
