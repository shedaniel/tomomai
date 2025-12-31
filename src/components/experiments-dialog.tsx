"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Flags } from "@/lib/flags";
import { trpc } from "@/lib/trpc-client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

interface ExperimentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFlags?: Flags;
}

export function ExperimentsDialog({ open, onOpenChange, initialFlags }: ExperimentsDialogProps) {
  const t = useTranslations();
  const [flagToggles, setFlagToggles] = useState<Partial<Flags>>(() => {
    const toggles: Partial<Flags> = {};
    if (initialFlags) {
      // Initialize with all initial flags passed
      return initialFlags;
    }
    return toggles;
  });

  // Fetch user-selectable flags metadata
  const { data: flagsData } = trpc.user.getUserSelectableFlags.useQuery();
  const flagDefinitions = flagsData?.flags;

  const handleToggle = async (flagKey: keyof Flags, value: boolean) => {
    setFlagToggles(prev => ({
      ...prev,
      [flagKey]: value,
    }));

    // Set cookie directly on the client
    try {
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      const cookieValue = JSON.stringify({ ...flagToggles, [flagKey]: value });
      document.cookie = `flagOverrides=${encodeURIComponent(cookieValue)}; path=/; expires=${expiresAt.toUTCString()}; SameSite=Lax`;

      toast.success(t('common.save'));

      // Reload page to apply changes
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error("Failed to update flag:", error);
      toast.error("Failed to update experiment flag");
    }
  };

  const handleReset = async (flagKey: keyof Flags) => {
    const def = flagDefinitions?.[flagKey] as any;
    if (!def) return;

    // Reset to default value
    await handleToggle(flagKey, def.defaultValue);
  };

  if (!flagDefinitions) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('common.experiments')}</DialogTitle>
          <DialogDescription>
            Welcome to the feature flags page for tomomai ともマイ.
            <br />
            <br />
            These features are not yet stable and may be changed or removed at any time.
            Toggling these features may cause unexpected behavior and data loss.
            <br />
            <br />
            Use at your own risk. Support is not provided for these features.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {Object.entries(flagDefinitions).map(([key, def]: [string, any]) => {
            const flagKey = key as keyof Flags;
            const isEnabled = flagToggles[flagKey] ?? false;
            const isModified = flagToggles[flagKey] !== def.defaultValue;

            return (
              <div key={flagKey} className="flex items-center justify-between">
                <Label className="text-sm font-medium cursor-pointer">
                  {flagKey}
                </Label>
                <div className="flex items-center gap-2">
                  {isModified && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0"
                      onClick={() => handleReset(flagKey)}
                      title="Reset to default"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(value) => handleToggle(flagKey, value)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
