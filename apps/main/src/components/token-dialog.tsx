"use client";

import { useGame } from "./providers/game-provider";
import { Region } from "@/lib/types";
import { TokenDialogCn } from "./token-dialog-cn";
import { TokenDialogIntlNew } from "./token-dialog-intl-new";
import { TokenDialogSega } from "./token-dialog-sega";

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
  if (region === "jp" || (region === "intl" && !game.cookieLoginConfigured)) {
    return (
      <TokenDialogSega
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onTokenUpdate={onTokenUpdate}
      />
    );
  }

  if (region === "cn") {
    return (
      <TokenDialogCn
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onTokenUpdate={onTokenUpdate}
        startSessionPolling={startSessionPolling}
        stopSessionPolling={stopSessionPolling}
      />
    );
  }

  return (
    <TokenDialogIntlNew
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onTokenUpdate={onTokenUpdate}
      startSessionPolling={startSessionPolling}
      stopSessionPolling={stopSessionPolling}
    />
  );
}
