"use client";

import { Button } from "@tomomai/ui";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@tomomai/ui";
import { Label } from "@tomomai/ui";
import { Switch } from "@tomomai/ui";
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

  const handleToggle = (flagKey: keyof Flags, value: boolean) => {
    setFlagToggles(prev => ({
      ...prev,
      [flagKey]: value,
    }));
  };

  const handleReset = (flagKey: keyof Flags) => {
    const def = flagDefinitions?.[flagKey] as any;
    if (!def) return;
    handleToggle(flagKey, def.defaultValue);
  };

  const hasChanges = initialFlags
    ? Object.keys(flagToggles).some(key => flagToggles[key as keyof Flags] !== initialFlags[key as keyof Flags])
    : Object.keys(flagToggles).length > 0;

  const handleApply = () => {
    try {
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      const cookieValue = JSON.stringify(flagToggles);
      document.cookie = `flagOverrides=${encodeURIComponent(cookieValue)}; path=/; expires=${expiresAt.toUTCString()}; SameSite=Lax`;

      toast.success(t('common.save'));

      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error("Failed to update flag:", error);
      toast.error("Failed to update experiment flag");
    }
  };

  if (!flagDefinitions) {
    return null;
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[500px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('common.experiments')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Welcome to the feature flags page for tomomai ともマイ.
            <br />
            <br />
            These features are not yet stable and may be changed or removed at any time.
            Toggling these features may cause unexpected behavior and data loss.
            <br />
            <br />
            Use at your own risk. Support is not provided for these features.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

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

        <div className="flex justify-end pt-4">
          <Button onClick={handleApply} disabled={!hasChanges}>Apply</Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
