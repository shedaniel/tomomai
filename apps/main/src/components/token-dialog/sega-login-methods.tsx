"use client";

import { useGame } from "@/components/providers/game-provider";
import type { Region } from "@/lib/games/ids";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@tomomai/ui";
import { Cookie, Key, Puzzle, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MethodCard } from "./method-card";
import { SegaCookieDialog } from "./sega-cookie";
import { SegaCredentialsDialog } from "./sega-credentials";
import { SegaUserscriptDialog } from "./sega-userscript";
import { useTomomaiUserscript } from "./use-tomomai-userscript";

interface SegaLoginMethodsDialogProps {
  region: Region;
  /** Also offers signing in with SEGA ID credentials. */
  offerCredentials: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTokenUpdate: (token: string) => Promise<void>;
}

type SubDialog = "credentials" | "cookie" | "userscript" | null;

export function SegaLoginMethodsDialog({ region, offerCredentials, isOpen, onOpenChange, onTokenUpdate }: SegaLoginMethodsDialogProps) {
  const t = useTranslations();
  const game = useGame();
  const [subDialog, setSubDialog] = useState<SubDialog>(null);

  const closeAll = () => {
    setSubDialog(null);
    onOpenChange(false);
  };

  const detectedUserscript = useTomomaiUserscript();
  const userscriptReady = trpc.user.isUserscriptEnabled.useQuery(undefined, { enabled: isOpen, staleTime: Infinity }).data === true;
  const userscriptInstalled = userscriptReady && detectedUserscript !== null;
  const userscriptCard = (
    <MethodCard
      icon={Puzzle}
      title={t("tokenDialog.methods.userscript.title")}
      badge={userscriptInstalled
        ? { label: t("tokenDialog.methods.userscript.installed"), variant: "default" }
        : userscriptReady ? undefined : { label: t("tokenDialog.comingSoonBadge"), variant: "secondary" }}
      description={t("tokenDialog.methods.userscript.description")}
      onClick={() => setSubDialog("userscript")}
      disabled={!userscriptReady}
    />
  );

  const submit = async (token: string) => {
    await onTokenUpdate(token);
    closeAll();
  };

  return (
    <>
      <ResponsiveDialog open={isOpen} onOpenChange={open => { if (!subDialog) open ? onOpenChange(true) : closeAll(); }}>
        <ResponsiveDialogContent className={cn("sm:max-w-md", subDialog && "opacity-70!")}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="flex items-center space-x-2">
              <Key className="h-5 w-5" />
              <span>{t("tokenDialog.title", { game: game.brand.displayName })}</span>
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("tokenDialog.intlDescription", { game: game.brand.displayName })} {t("tokenDialog.credentialsStored")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-3">
            {userscriptInstalled && userscriptCard}
            {offerCredentials && (
              <MethodCard
                icon={UserRound}
                title={t("tokenDialog.methods.segaId.title")}
                badge={userscriptInstalled ? undefined : { label: t("tokenDialog.recommendedBadge"), variant: "default" }}
                description={t("tokenDialog.methods.segaId.description", { net: game.brand.netName })}
                onClick={() => setSubDialog("credentials")}
              />
            )}
            <MethodCard
              icon={Cookie}
              title={t("tokenDialog.methods.cookie.title")}
              description={t("tokenDialog.methods.cookie.description")}
              onClick={() => setSubDialog("cookie")}
            />
            {!userscriptInstalled && userscriptCard}
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {offerCredentials && (
        <SegaCredentialsDialog
          region={region}
          isOpen={subDialog === "credentials"}
          onOpenChange={open => setSubDialog(open ? "credentials" : null)}
          onTokenUpdate={submit}
        />
      )}
      <SegaCookieDialog
        region={region}
        isOpen={subDialog === "cookie"}
        onOpenChange={open => setSubDialog(open ? "cookie" : null)}
        onTokenUpdate={submit}
      />
      {userscriptReady && (
        <SegaUserscriptDialog
          region={region}
          isOpen={subDialog === "userscript"}
          onOpenChange={open => setSubDialog(open ? "userscript" : null)}
          onTokenSaved={() => submit("")}
        />
      )}
    </>
  );
}
