"use client";

import { useState } from "react";
import { Button } from "@tomomai/ui";
import { Badge } from "@tomomai/ui";
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
import { trpc } from "@/lib/trpc-client";
import { API_SCOPES, type ScopeKey } from "@/lib/api/scopes";
import { toast } from "sonner";
import { Globe, Loader2, AppWindow } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useLocale } from "@/components/providers/locale-provider";
import { SettingsHeader } from "@/components/settings/primitives";

type Authorization = {
  consentId: string;
  clientId: string;
  scopes: string[];
  createdAt: Date;
  updatedAt: Date;
  appName: string | null;
  appIcon: string | null;
  appUri: string | null;
};

export function ApplicationsSettings() {
  const t = useTranslations();
  const ta = useTranslations("settings.applications");
  const tc = useTranslations("common");
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const [revokeClientId, setRevokeClientId] = useState<string | null>(null);

  const { data: authorizations, isLoading } = trpc.developer.listOAuthAuthorizations.useQuery();

  const revokeMutation = trpc.developer.revokeOAuthAuthorization.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["developer", "listOAuthAuthorizations"]] });
      toast.success(ta("revokeSuccess"));
      setRevokeClientId(null);
    },
    onError: (err) => toast.error(err.message ?? ta("revokeError")),
  });

  function formatDate(date: Date) {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(date));
  }

  return (
    <div>
      <SettingsHeader
        title={t("settings.pages.applications.title")}
        description={t("settings.pages.applications.description")}
      />

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 rounded-md border text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tc("loading")}
        </div>
      ) : !authorizations || authorizations.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 rounded-md border border-dashed text-center">
          <AppWindow className="h-7 w-7 opacity-60" />
          <p className="text-sm text-muted-foreground">{ta("noAuthorizations")}</p>
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {authorizations.map((auth: Authorization) => (
            <div key={auth.consentId} className="flex items-start gap-4 px-4 py-3.5">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden mt-0.5">
                {auth.appIcon ? (
                  <img src={auth.appIcon} alt={auth.appName ?? "App"} className="h-full w-full object-cover" />
                ) : (
                  <Globe className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold leading-none">
                    {auth.appName ?? auth.clientId}
                  </span>
                </div>
                <p className="font-mono text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm border border-border w-fit truncate max-w-xs">
                  {auth.clientId}
                </p>
                {auth.appUri && (
                  <a
                    href={auth.appUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline truncate block"
                  >
                    {auth.appUri}
                  </a>
                )}
                {auth.scopes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {auth.scopes
                      .filter((s) => s in API_SCOPES)
                      .map((s) => (
                        <Badge key={s} variant="outline" className="text-xs">
                          {API_SCOPES[s as ScopeKey]?.name ?? s}
                        </Badge>
                      ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {ta("grantedAt", { date: formatDate(auth.createdAt) })}
                </p>
              </div>
              <div className="shrink-0 pt-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setRevokeClientId(auth.clientId)}
                >
                  {ta("revokeButton")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!revokeClientId} onOpenChange={(v) => !v && setRevokeClientId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ta("revokeDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {ta("revokeDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => revokeClientId && revokeMutation.mutate({ clientId: revokeClientId })}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                ta("revokeDialog.confirm")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
