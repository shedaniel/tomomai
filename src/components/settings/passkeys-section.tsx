"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { AltchaWidget } from "@/components/ui/altcha-widget";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Passkey = {
  id: string;
  name: string | null;
  createdAt: Date;
  deviceType: string;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function PasskeysSection() {
  const t = useTranslations("passkeys");
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
      toast.success(t("deleteSuccess"));
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || t("deleteError"));
    },
  });

  const handleAddPasskeyClick = () => {
    setShowAltcha(true);
  };

  const handleAltchaSolve = async (payload: string) => {
    setShowAltcha(false);
    setAddingPasskey(true);
    try {
      const result = await authClient.passkey.addPasskey({
        fetchOptions: { headers: { "x-captcha-response": payload } },
      });
      if (result?.error) {
        toast.error(result.error.message || t("addError"));
      } else {
        toast.success(t("addSuccess"));
        queryClient.invalidateQueries({ queryKey: ["passkeys"] });
      }
    } catch (err) {
      console.error("Add passkey error:", err);
      toast.error(t("addError"));
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
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <Label className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {t("title")}
          </Label>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
        {!showAltcha && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddPasskeyClick}
            disabled={addingPasskey}
            className="shrink-0"
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
        )}
      </div>

      {showAltcha && (
        <div className="flex flex-col items-center gap-3 p-4 rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">{t("verifyingCaptcha")}</p>
          <AltchaWidget onSolve={handleAltchaSolve} onError={handleAltchaError} className="w-full" />
          <Button variant="ghost" size="sm" onClick={() => setShowAltcha(false)}>
            Cancel
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
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
                  {pk.deviceType} · {formatDate(pk.createdAt)}
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
            <AlertDialogTitle>Delete passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              This passkey will be removed. You won&apos;t be able to use it to sign in anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
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
