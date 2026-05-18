"use client";

import { useState } from "react";
import { Button } from "@tomomai/ui";
import { Input } from "@tomomai/ui";
import { Label } from "@tomomai/ui";
import { Badge } from "@tomomai/ui";
import { Switch } from "@tomomai/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@tomomai/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tomomai/ui";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc-client";
import { API_SCOPES, type ScopeKey } from "@/lib/api/scopes";
import { CreateApiKeyDialog } from "@/components/developer/create-api-key-dialog";
import { toast } from "sonner";
import { Plus, Trash2, Key, Loader2, RefreshCw, Copy, Check, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useLocale } from "@/components/providers/locale-provider";

type ApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  createdAt: Date;
  expiresAt: Date | null;
  permissions: Record<string, string[]> | null;
};

function getScopeKeys(permissions: Record<string, string[]> | null): ScopeKey[] {
  if (!permissions) return [];
  return Object.keys(permissions).filter((k): k is ScopeKey => k in API_SCOPES);
}

export function ApiKeysSection() {
  const t = useTranslations("settings.developer");
  const tc = useTranslations("common");
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [regenerateId, setRegenerateId] = useState<string | null>(null);
  const [regeneratedKey, setRegeneratedKey] = useState<string | null>(null);
  const [copiedRegen, setCopiedRegen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function formatDate(date: Date | null) {
    if (!date) return t("apiKeys.never");
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(date));
  }

  const { data: keys, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const result = await authClient.apiKey.list();
      if (result.error) throw new Error(result.error.message);
      return result.data.apiKeys as ApiKey[];
    },
  });

  const rotateMutation = trpc.developer.rotateApiKey.useMutation({
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setRegenerateId(null);
      setRegeneratedKey(data.key);
    },
    onError: (err) => {
      toast.error(err.message ?? t("apiKeys.regenerateError"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await authClient.apiKey.delete({ keyId: id });
      if (result.error) throw new Error(result.error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success(t("apiKeys.deleteSuccess"));
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message ?? t("apiKeys.deleteError"));
    },
  });

  async function handleToggle(id: string, enabled: boolean) {
    setTogglingId(id);
    try {
      const result = await authClient.apiKey.update({ keyId: id, enabled });
      if (result.error) {
        toast.error(result.error.message ?? t("apiKeys.updateError"));
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    } catch {
      toast.error(t("apiKeys.updateError"));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-2">
          <Label className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            {t("apiKeys.label")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("apiKeys.description")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="bg-background shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("apiKeys.createButton")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 rounded-md border text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tc("loading")}
        </div>
      ) : !keys || keys.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 rounded-md border border-dashed text-center">
          <Key className="h-7 w-7 opacity-60" />
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("apiKeys.emptyTitle")}</p>
            <p className="text-xs text-muted-foreground">
              <button
                onClick={() => setCreateOpen(true)}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {t("apiKeys.emptyCreateLink")}
              </button>{" "}
              {t("apiKeys.emptySuffix")}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {keys.map((key) => {
            const scopes = getScopeKeys(key.permissions);
            const isExpired = key.expiresAt && new Date(key.expiresAt) < new Date();

            return (
              <div key={key.id} className="flex items-start gap-4 px-4 py-3.5">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-sm font-semibold leading-none">
                      {key.name ?? t("apiKeys.unnamed")}
                    </span>
                    {isExpired && (
                      <Badge variant="destructive" className="text-xs">
                        {t("apiKeys.expired")}
                      </Badge>
                    )}
                    {!key.enabled && !isExpired && (
                      <Badge variant="secondary" className="text-xs">
                        {t("apiKeys.disabled")}
                      </Badge>
                    )}
                  </div>
                  <p className="font-mono text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm border border-border w-fit">
                    {key.start ? `${key.start}${"*".repeat(20)}` : "—"}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {scopes.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs">
                        {t(`scopes.${s}.name`)}
                      </Badge>
                    ))}
                    <span className="text-xs text-muted-foreground">
                      {t("apiKeys.createdAt", { date: formatDate(key.createdAt) })}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">
                      {t("apiKeys.expiresAt", { date: formatDate(key.expiresAt) })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                  <Switch
                    checked={key.enabled}
                    disabled={togglingId === key.id || !!isExpired}
                    onCheckedChange={(v) => handleToggle(key.id, v)}
                    aria-label={t("apiKeys.toggleAriaLabel")}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setRegenerateId(key.id)}
                    aria-label={t("apiKeys.regenerateAriaLabel")}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(key.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateApiKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["api-keys"] })}
      />

      {/* Regenerate confirmation */}
      <AlertDialog open={!!regenerateId} onOpenChange={(open) => !open && setRegenerateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("apiKeys.regenerateDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("apiKeys.regenerateDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotateMutation.isPending}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => regenerateId && rotateMutation.mutate({ keyId: regenerateId })}
              disabled={rotateMutation.isPending}
            >
              {rotateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("apiKeys.regenerateDialog.confirm")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerated key display */}
      <Dialog open={!!regeneratedKey} onOpenChange={(open) => { if (!open) { setRegeneratedKey(null); setCopiedRegen(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("apiKeys.regeneratedTitle")}</DialogTitle>
            <DialogDescription>{t("apiKeys.regeneratedDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Input readOnly value={regeneratedKey ?? ""} className="font-mono text-sm pr-10" />
              <button
                onClick={async () => {
                  if (!regeneratedKey) return;
                  try {
                    await navigator.clipboard.writeText(regeneratedKey);
                    setCopiedRegen(true);
                    setTimeout(() => setCopiedRegen(false), 2000);
                  } catch {
                    toast.error(tc("clipboardError"));
                  }
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {copiedRegen ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t("apiKeys.regeneratedSaveWarning")}
            </p>
            <div className="flex justify-end">
              <Button onClick={() => { setRegeneratedKey(null); setCopiedRegen(false); }}>
                {t("createDialog.done")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("apiKeys.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("apiKeys.deleteDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              variant="destructive"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("apiKeys.deleteDialog.confirm")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
