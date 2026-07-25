"use client";

import { SettingsField } from "@/components/settings/primitives";
import type { ProfilePrivacySettings } from "@/lib/types";
import { Switch } from "@tomomai/ui";
import { useTranslations } from "next-intl";

export const PROFILE_PRIVACY_FIELDS = [
  ["profileShowAllScores", "showAllScores"],
  ["profileShowScoreDetails", "showScoreDetails"],
  ["profileShowPlates", "showPlates"],
  ["profileShowPlayCounts", "showPlayCounts"],
  ["profileShowEvents", "showEvents"],
  ["profileShowInSearch", "showInSearch"],
] as const satisfies ReadonlyArray<readonly [keyof ProfilePrivacySettings, string]>;

interface ProfilePrivacyFieldsProps {
  value: ProfilePrivacySettings;
  onChange(value: ProfilePrivacySettings): void;
  disabled?: boolean;
  idPrefix?: string;
}

export function ProfilePrivacyFields({
  value,
  onChange,
  disabled = false,
  idPrefix = "profile-privacy",
}: ProfilePrivacyFieldsProps) {
  const t = useTranslations();

  return (
    <div className="grid gap-3">
      {PROFILE_PRIVACY_FIELDS.map(([key, translationKey]) => {
        const id = `${idPrefix}-${key}`;
        return (
          <SettingsField
            key={key}
            layout="inline"
            htmlFor={id}
            label={t(`settings.profile.privacy.${translationKey}.label`)}
            description={t(`settings.profile.privacy.${translationKey}.description`)}
            labelClassName="text-sm font-normal"
            action={
              <Switch
                id={id}
                checked={value[key]}
                onCheckedChange={(checked) => onChange({ ...value, [key]: checked })}
                disabled={disabled}
              />
            }
          />
        );
      })}
    </div>
  );
}
