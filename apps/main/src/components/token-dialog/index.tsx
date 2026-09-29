"use client";

import { useGame } from "@/components/providers/game-provider";
import { isGameRegion } from "@/lib/games/frontend";
import { Region } from "@/lib/types";
import { CnTokenDialog } from "@/components/games/maimai/cn-token-dialog";
import { SegaCookieWizardDialog } from "./sega-cookie-wizard";
import { SegaCredentialsDialog } from "./sega-credentials";

interface TokenDialogProps {
  region: Region;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTokenUpdate: (token: string) => Promise<void>;
  startSessionPolling?: (region: Region, onSessionDetected?: () => void) => void;
  stopSessionPolling?: () => void;
}

export function TokenDialog({
  region,
  isOpen,
  onOpenChange,
  onTokenUpdate,
  startSessionPolling,
  stopSessionPolling,
}: TokenDialogProps) {
  const game = useGame();
  if (!isGameRegion(game, region)) return null;
  if (region === "jp" || (region === "intl" && !game.fetch.cookieLogin)) {
    return (
      <SegaCredentialsDialog
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onTokenUpdate={onTokenUpdate}
      />
    );
  }

  if (region === "cn") {
    return (
      <CnTokenDialog
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onTokenUpdate={onTokenUpdate}
        startSessionPolling={startSessionPolling}
        stopSessionPolling={stopSessionPolling}
      />
    );
  }

  return (
    <SegaCookieWizardDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onTokenUpdate={onTokenUpdate}
      startSessionPolling={startSessionPolling}
      stopSessionPolling={stopSessionPolling}
    />
  );
}
