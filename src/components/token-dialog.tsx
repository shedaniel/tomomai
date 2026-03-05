"use client";

import { Region } from "@/lib/types";
import { TokenDialogJapan } from "./token-dialog-japan";
import { TokenDialogIntlNew } from "./token-dialog-intl-new";
import { TokenDialogCn } from "./token-dialog-cn";

interface TokenDialogProps {
  region: Region;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTokenUpdate: (token: string) => Promise<void>;
  startSessionPolling?: (region: "intl" | "jp", onSessionDetected?: () => void) => void;
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
