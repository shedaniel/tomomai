"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { authClient, useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { Loader2, Monitor, Trash2, LogOut } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { UAParser } from "ua-parser-js";

type Session = {
  id: string;
  token: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
};

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown";
  const { browser, os } = UAParser(ua);
  const browserStr =
    [browser.name, browser.major].filter(Boolean).join(" ") || "Unknown browser";
  const osStr = [os.name, os.version].filter(Boolean).join(" ");
  return osStr ? `${browserStr} on ${osStr}` : browserStr;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export function SessionsSection() {
  const t = useTranslations("settings.sessions");
  const tc = useTranslations("common");
  const { data: currentSession } = useSession();
  const queryClient = useQueryClient();
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const result = await authClient.listSessions();
      if (result.error) throw new Error(result.error.message);
      return result.data as Session[];
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (token: string) => {
      const result = await authClient.revokeSession({ token });
      if (result.error) throw new Error(result.error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast.success(t("revokeSuccess"));
      setRevokeId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.revokeOtherSessions();
      if (result.error) throw new Error(result.error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast.success(t("revokeAllSuccess"));
      setRevokeAllOpen(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const currentToken = currentSession?.session?.token;
  const otherSessions = sessions?.filter((s) => s.token !== currentToken);
  const hasOtherSessions = otherSessions && otherSessions.length > 0;

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-2">
          <Label className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            {t("title")}
          </Label>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
        {hasOtherSessions && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevokeAllOpen(true)}
            className="bg-background shrink-0"
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t("revokeAll")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 rounded-md border text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tc("loading")}
        </div>
      ) : !sessions || sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 rounded-md border border-dashed text-center">
          <Monitor className="h-7 w-7 opacity-60" />
          <p className="text-sm text-muted-foreground">{t("noOtherSessions")}</p>
        </div>
      ) : (
        <div className="rounded-md border divide-y py-1">
          {[...sessions].sort((a, b) => {
            const aIsCurrent = a.token === currentToken;
            const bIsCurrent = b.token === currentToken;
            if (aIsCurrent !== bIsCurrent) return aIsCurrent ? -1 : 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }).map((session) => {
            const isCurrent = session.token === currentToken;
            return (
              <div key={session.id} className="flex items-start gap-4 px-4 py-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap h-5.5">
                    <span className="text-sm font-semibold leading-none">
                      {parseUserAgent(session.userAgent)}
                    </span>
                    {isCurrent && (
                      <Badge variant="default" className="text-xs">
                        {t("currentSession")}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    {session.ipAddress && (
                      <>
                        <span>{t("ip")}: {session.ipAddress}</span>
                        <span>·</span>
                      </>
                    )}
                    <span>{t("createdAt")}: {formatDate(session.createdAt)}</span>
                  </div>
                </div>
                {!isCurrent && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0 self-center"
                    onClick={() => setRevokeId(session.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Revoke single session confirmation */}
      <AlertDialog open={!!revokeId} onOpenChange={(open) => !open && setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("revokeConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("revokeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const session = sessions?.find((s) => s.id === revokeId);
                if (session) revokeMutation.mutate(session.token);
              }}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("revoke")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke all other sessions confirmation */}
      <AlertDialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("revokeAllConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("revokeAllDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeAllMutation.isPending}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeAllMutation.mutate()}
              disabled={revokeAllMutation.isPending}
            >
              {revokeAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("revokeAll")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
