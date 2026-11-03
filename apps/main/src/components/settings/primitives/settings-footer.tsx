"use client";

import { useEffect, useRef } from "react";
import { Button } from "@tomomai/ui";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useSettingsForm } from "./settings-form";
import { useUnsavedChanges } from "./unsaved-changes";

const SHAKE: Keyframe[] = [
  { transform: "translateX(0)" },
  { transform: "translateX(-8px)" },
  { transform: "translateX(7px)" },
  { transform: "translateX(-5px)" },
  { transform: "translateX(3px)" },
  { transform: "translateX(0)" },
];

/** Cancel and Save at the end of the form. With unsaved changes it floats at the bottom of the screen, and shakes when leaving is held back. */
export function SettingsFooter() {
  const t = useTranslations();
  const { isLoading, isDirty, runSave, runReset } = useSettingsForm();
  const nudge = useUnsavedChanges()?.nudge ?? 0;
  const bar = useRef<HTMLDivElement>(null);
  const disabled = isLoading || !isDirty;

  useEffect(() => {
    if (nudge === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    bar.current?.animate(SHAKE, { duration: 420, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" });
  }, [nudge]);

  return (
    <div
      ref={bar}
      className={cn(
        "mt-10 flex items-center justify-end gap-2 border-t pt-6",
        isDirty && "glass-strong sticky bottom-4 z-20 rounded-xl border px-4 py-3 shadow-lg",
      )}
    >
      {isDirty && (
        <p className="mr-auto text-sm text-muted-foreground" role="status">
          {t("settings.unsaved.bar")}
        </p>
      )}
      <Button variant="outline" onClick={runReset} disabled={disabled}>
        {t("common.cancel")}
      </Button>
      <Button onClick={() => void runSave()} disabled={disabled}>
        {isLoading ? t("settings.saving") : t("settings.saveChanges")}
      </Button>
    </div>
  );
}
