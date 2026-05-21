"use client";

import { Button } from "@tomomai/ui";
import { useTranslations } from "next-intl";
import { useSettingsForm } from "./settings-form";

export function SettingsFooter() {
  const t = useTranslations();
  const { isLoading, isDirty, runSave, runReset } = useSettingsForm();
  const disabled = isLoading || !isDirty;
  return (
    <div className="flex justify-end space-x-2 mt-10 border-t pt-6">
      <Button variant="outline" onClick={runReset} disabled={disabled}>
        {t("common.cancel")}
      </Button>
      <Button onClick={runSave} disabled={disabled}>
        {isLoading ? t("settings.saving") : t("settings.saveChanges")}
      </Button>
    </div>
  );
}
