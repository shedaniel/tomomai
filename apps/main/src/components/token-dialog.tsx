"use client";

import { Region } from "@/lib/types";
import { TokenDialogCn } from "./token-dialog-cn";
import { TokenDialogIntlNew } from "./token-dialog-intl-new";
import { TokenDialogJapan } from "./token-dialog-japan";

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
  if (region === "jp") {
    return (
      <TokenDialogJapan
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
