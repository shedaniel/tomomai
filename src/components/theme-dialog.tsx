"use client";

import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AnimatedDialog, AnimatedDialogContent } from "@/components/ui/animated-dialog";
import { themes, getSavedThemeId, saveThemeId, applyTheme, Theme } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

interface ThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ThemePreview({ theme, selected, onClick }: { theme: Theme; selected: boolean; onClick: () => void }) {
  // Calculate preview colors based on theme values
  const isDark = theme.dark;

  // For light themes
  const lightPrimaryColor = `oklch(${1 - theme.darkness} ${theme.contrast * 0.169} ${theme.hue})`;
  const lightBgColor = `oklch(${1 - (theme.lightness ?? 1.0) * 0.019} ${theme.contrast * 0.008 * (theme.saturation ?? 1.0)} ${theme.hue})`;

  // For dark themes
  const darkPrimaryColor = `oklch(${0.75 + theme.darkness * 0.2} ${theme.contrast * 0.15} ${theme.hue})`;
  const darkBgColor = `oklch(${0.1 + (theme.lightness ?? 1.0) * 0.045} ${theme.contrast * 0.015 * (theme.saturation ?? 1.0)} ${theme.hue})`;

  const primaryColor = isDark ? darkPrimaryColor : lightPrimaryColor;
  const bgColor = isDark ? darkBgColor : lightBgColor;

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all hover:scale-105",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50"
      )}
    >
      {selected && (
        <div className="absolute top-1 right-1 rounded-full bg-primary p-0.5">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}
      <div
        className="w-full h-12 rounded-md flex items-center justify-center border border-border"
        style={{ backgroundColor: bgColor }}
      >
        <div
          className="w-8 h-8 rounded-full"
          style={{ backgroundColor: primaryColor }}
        />
      </div>
      <span className="text-xs font-medium text-center">
        {theme.name}
      </span>
    </button>
  );
}

export function ThemeDialog({ open, onOpenChange }: ThemeDialogProps) {
  const t = useTranslations();
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedThemeId(getSavedThemeId() ?? "burnt-brown");
    }
  }, [open]);

  const handleThemeSelect = (theme: Theme) => {
    setSelectedThemeId(theme.id);
    saveThemeId(theme.id);
    applyTheme(theme);
  };

  // Group themes by color family for better organization
  const colorFamilies = useMemo(() => {
    // set of groups
    const groups = new Set<string>();
    themes.forEach(t => groups.add(t.group));
    return Array.from(groups).map(group => ({ labelKey: group }));
  }, [themes]);

  return (
    <AnimatedDialog open={open} onOpenChange={onOpenChange}>
      <AnimatedDialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("theme.title")}</DialogTitle>
          <DialogDescription>
            {t("theme.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {colorFamilies.map((family) => {
            const groupThemes = themes.filter(t => t.group === family.labelKey);
            return (
              <div key={family.labelKey}>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  {t(`theme.groups.${family.labelKey}`)}
                </h3>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${groupThemes.length}, 1fr)` }}>
                  {groupThemes.map((theme) => (
                    <ThemePreview
                      key={theme.id}
                      theme={theme}
                      selected={selectedThemeId === theme.id}
                      onClick={() => handleThemeSelect(theme)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </AnimatedDialogContent>
    </AnimatedDialog>
  );
}
