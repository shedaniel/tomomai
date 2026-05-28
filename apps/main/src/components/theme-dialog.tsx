"use client";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@tomomai/ui";
import { Button } from "@tomomai/ui";
import { Slider } from "@tomomai/ui";
import { Switch } from "@tomomai/ui";
import { themes, getSavedThemeId, saveThemeId, applyTheme, Theme, buildCustomThemeId, isCustomThemeId, parseCustomThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useCallback } from "react";

interface ThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customThemesEnabled?: boolean;
}

function ThemePreview({ theme, selected, onClick }: { theme: Theme; selected: boolean; onClick: () => void }) {
  const isDark = theme.dark;

  const lightPrimaryColor = `oklch(${1 - theme.darkness} ${theme.contrast * 0.169} ${theme.hue})`;
  const lightBgColor = `oklch(${1 - (theme.lightness ?? 1.0) * 0.019} ${theme.contrast * 0.008 * (theme.saturation ?? 1.0)} ${theme.hue})`;

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

function CustomThemePreview({ theme }: { theme: Theme }) {
  const isDark = theme.dark;
  const primaryColor = isDark
    ? `oklch(${0.75 + theme.darkness * 0.2} ${theme.contrast * 0.15} ${theme.hue})`
    : `oklch(${1 - theme.darkness} ${theme.contrast * 0.169} ${theme.hue})`;
  const bgColor = isDark
    ? `oklch(${0.1 + (theme.lightness ?? 1.0) * 0.045} ${theme.contrast * 0.015} ${theme.hue})`
    : `oklch(${1 - (theme.lightness ?? 1.0) * 0.019} ${theme.contrast * 0.008} ${theme.hue})`;

  return (
    <div
      className="w-full h-16 rounded-lg border border-border flex items-center justify-center gap-3 px-4"
      style={{ backgroundColor: bgColor }}
    >
      <div className="w-8 h-8 rounded-full shrink-0" style={{ backgroundColor: primaryColor }} />
      <div className="flex flex-col gap-1 flex-1">
        <div className="h-2 rounded-full w-3/4" style={{ backgroundColor: primaryColor, opacity: 0.7 }} />
        <div className="h-2 rounded-full w-1/2" style={{ backgroundColor: primaryColor, opacity: 0.4 }} />
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="flex-1"
      />
      <span className="text-xs font-mono w-10 text-right shrink-0">{value.toFixed(step < 1 ? 2 : 0)}</span>
    </div>
  );
}

const DEFAULT_CUSTOM: Pick<Theme, "hue" | "contrast" | "darkness" | "dark" | "lightness"> = {
  hue: 240,
  contrast: 0.9,
  darkness: 0.7,
  dark: false,
  lightness: 1.0,
};

export function ThemeDialog({ open, onOpenChange, customThemesEnabled = false }: ThemeDialogProps) {
  const t = useTranslations();
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [customParams, setCustomParams] = useState(DEFAULT_CUSTOM);
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    if (open) {
      const savedId = getSavedThemeId() ?? "burnt-brown";
      if (isCustomThemeId(savedId)) {
        const parsed = parseCustomThemeId(savedId);
        if (parsed) {
          setCustomParams({
            hue: parsed.hue,
            contrast: parsed.contrast,
            darkness: parsed.darkness,
            dark: parsed.dark,
            lightness: parsed.lightness ?? 1.0,
          });
          setUseCustom(true);
          setSelectedThemeId(savedId);
        }
      } else {
        setSelectedThemeId(savedId);
        setUseCustom(false);
      }
    }
  }, [open]);

  const handleThemeSelect = (theme: Theme) => {
    setSelectedThemeId(theme.id);
    setUseCustom(false);
    saveThemeId(theme.id);
    applyTheme(theme);
  };

  const applyCustomTheme = useCallback((params: typeof DEFAULT_CUSTOM) => {
    const id = buildCustomThemeId(params);
    const theme: Theme = { id, group: "custom", name: "Custom", saturation: 1.0, ...params };
    setSelectedThemeId(id);
    saveThemeId(id);
    applyTheme(theme);
  }, []);

  const handleCustomToggle = (enabled: boolean) => {
    setUseCustom(enabled);
    if (enabled) {
      applyCustomTheme(customParams);
    } else {
      // revert to default preset
      const fallbackId = "burnt-brown";
      const fallback = themes.find(t => t.id === fallbackId)!;
      setSelectedThemeId(fallbackId);
      saveThemeId(fallbackId);
      applyTheme(fallback);
    }
  };

  const handleCustomParam = <K extends keyof typeof DEFAULT_CUSTOM>(key: K, value: typeof DEFAULT_CUSTOM[K]) => {
    const next = { ...customParams, [key]: value };
    setCustomParams(next);
    applyCustomTheme(next);
  };

  const colorFamilies = useMemo(() => {
    const groups = new Set<string>();
    themes.forEach(t => groups.add(t.group));
    return Array.from(groups).map(group => ({ labelKey: group }));
  }, []);

  const customThemeObj: Theme = {
    id: buildCustomThemeId(customParams),
    group: "custom",
    name: "Custom",
    saturation: 1.0,
    ...customParams,
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[calc(min(100vw,700px))] max-h-[90vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("theme.title")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("theme.description")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-4">
          {customThemesEnabled && (
            <div className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Custom Theme</span>
                <Switch checked={useCustom} onCheckedChange={handleCustomToggle} />
              </div>

              {useCustom && (
                <div className="space-y-3">
                  <CustomThemePreview theme={customThemeObj} />
                  <SliderRow
                    label="Hue"
                    value={customParams.hue}
                    min={0}
                    max={360}
                    step={1}
                    onChange={v => handleCustomParam("hue", v)}
                  />
                  <SliderRow
                    label="Contrast"
                    value={customParams.contrast}
                    min={0}
                    max={2}
                    step={0.01}
                    onChange={v => handleCustomParam("contrast", v)}
                  />
                  <SliderRow
                    label="Darkness"
                    value={customParams.darkness}
                    min={-1}
                    max={1}
                    step={0.01}
                    onChange={v => handleCustomParam("darkness", v)}
                  />
                  <SliderRow
                    label="Lightness"
                    value={customParams.lightness ?? 1.0}
                    min={0}
                    max={4}
                    step={0.01}
                    onChange={v => handleCustomParam("lightness", v)}
                  />
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">Dark mode</span>
                    <Switch
                      checked={customParams.dark}
                      onCheckedChange={v => handleCustomParam("dark", v)}
                    />
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCustomParams(DEFAULT_CUSTOM);
                        applyCustomTheme(DEFAULT_CUSTOM);
                      }}
                    >
                      Reset to default
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

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
                      selected={!useCustom && selectedThemeId === theme.id}
                      onClick={() => handleThemeSelect(theme)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
