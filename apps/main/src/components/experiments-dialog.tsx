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
import { FlagCategory, Flags } from "@/lib/flags";
import { trpc } from "@/lib/trpc-client";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

interface ExperimentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LEGACY_COOKIE_NAME = "flagOverrides";

const CATEGORY_LABELS: Record<FlagCategory, string> = {
  dashboard: "Dashboard",
  profile: "Profile",
  settings: "Settings",
  theming: "Theming",
  auth: "Authentication",
  developer: "Developer",
};

function clearLegacyCookie() {
  if (typeof document === "undefined") return;
  if (!document.cookie.split("; ").some(c => c.startsWith(`${LEGACY_COOKIE_NAME}=`))) return;
  document.cookie = `${LEGACY_COOKIE_NAME}=; path=/; Max-Age=0; SameSite=Lax`;
}

export function ExperimentsDialog({ open, onOpenChange }: ExperimentsDialogProps) {
  const t = useTranslations();
  const { data: flagsData, isLoading } = trpc.user.getUserSelectableFlags.useQuery();
  const setOverrides = trpc.user.setFlagOverrides.useMutation();

  const flagDefinitions = flagsData?.flags;
  const authenticated = flagsData?.authenticated ?? false;
  const initialOverrides = flagsData?.currentOverrides ?? {};

  const [overrideToggles, setOverrideToggles] = useState<Partial<Flags>>({});

  useEffect(() => {
    setOverrideToggles(initialOverrides);
  }, [flagsData]);

  useEffect(() => {
    clearLegacyCookie();
  }, []);

  const handleToggle = (flagKey: keyof Flags, value: boolean) => {
    setOverrideToggles(prev => ({ ...prev, [flagKey]: value }));
  };

  const handleReset = (flagKey: keyof Flags) => {
    setOverrideToggles(prev => {
      const next = { ...prev };
      delete next[flagKey];
      return next;
    });
  };

  const initialKeys = Object.keys(initialOverrides) as (keyof Flags)[];
  const currentKeys = Object.keys(overrideToggles) as (keyof Flags)[];
  const hasChanges =
    initialKeys.length !== currentKeys.length ||
    currentKeys.some(k => overrideToggles[k] !== initialOverrides[k as keyof Flags]) ||
    initialKeys.some(k => !(k in overrideToggles));

  const handleApply = async () => {
    try {
      await setOverrides.mutateAsync({ overrides: overrideToggles as Record<string, boolean> });
      toast.success(t('common.save'));
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error("Failed to update flags:", error);
      toast.error("Failed to update experiment flags");
    }
  };

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

        {isLoading || !flagDefinitions ? (
          <div className="py-6 text-sm text-muted-foreground">Loading…</div>
        ) : !authenticated ? (
          <div className="py-6 text-sm text-muted-foreground">
            Sign in to enable experimental features. Overrides are now tied to your account.
          </div>
        ) : (
          <>
            <div className="space-y-5">
              {(flagsData?.categoryOrder ?? []).map(category => {
                const entries = Object.entries(flagDefinitions).filter(
                  ([, def]) => def.category === category,
                );
                if (entries.length === 0) return null;

                return (
                  <div key={category} className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {CATEGORY_LABELS[category]}
                    </div>
                    <div className="space-y-3">
                      {entries.map(([key, def]) => {
                        const flagKey = key as keyof Flags;
                        const overridden = flagKey in overrideToggles;
                        const isEnabled = overrideToggles[flagKey] ?? def.defaultValue;

                        return (
                          <div key={flagKey} className="flex items-center justify-between">
                            <Label className="text-sm font-medium cursor-pointer">{flagKey}</Label>
                            <div className="flex items-center gap-2">
                              {overridden && (
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
                                onCheckedChange={value => handleToggle(flagKey, value)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={handleApply} disabled={!hasChanges || setOverrides.isPending}>
                Apply
              </Button>
            </div>
          </>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
