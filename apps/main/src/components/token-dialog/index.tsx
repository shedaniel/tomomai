"use client";

import { useGame } from "@/components/providers/game-provider";
import { isGameRegion } from "@/lib/games/frontend";
import type { Region } from "@/lib/games/ids";
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
  const methods = game.loginMethods[region] ?? [];

  if (methods.includes("maimai-cn")) {
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

  if (methods.includes("sega-cookie")) {
    return (
      <SegaCookieWizardDialog
        region={region}
        offerCredentials={methods.includes("sega-account")}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onTokenUpdate={onTokenUpdate}
        startSessionPolling={startSessionPolling}
        stopSessionPolling={stopSessionPolling}
      />
    );
  }

  if (methods.includes("sega-account")) {
    return (
      <SegaCredentialsDialog
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onTokenUpdate={onTokenUpdate}
      />
    );
  }

  return null;
}
