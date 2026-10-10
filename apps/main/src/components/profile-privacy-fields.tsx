"use client";

import { useGame } from "@/components/providers/game-provider";
import { SettingsField } from "@/components/settings/primitives";
import { supportsGameFeature } from "@/lib/games/frontend";
import type { GameCapability } from "@/lib/games/types";
import type { ProfilePrivacySettings } from "@/lib/types";
import { Switch } from "@tomomai/ui";
import { useTranslations } from "next-intl";

/** A field whose feature the served game does not offer is hidden, and its stored value is kept. */
export const PROFILE_PRIVACY_FIELDS: readonly { key: keyof ProfilePrivacySettings; labelKey: string; capability?: GameCapability }[] = [
  { key: "profileShowAllScores", labelKey: "showAllScores" },
  { key: "profileShowScoreDetails", labelKey: "showScoreDetails" },
  { key: "profileShowPlates", labelKey: "showPlates", capability: "plates" },
  { key: "profileShowPlayCounts", labelKey: "showPlayCounts" },
  { key: "profileShowEvents", labelKey: "showEvents", capability: "events" },
  { key: "profileShowInSearch", labelKey: "showInSearch" },
];

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
  const game = useGame();

  return (
    <div className="grid gap-3">
      {PROFILE_PRIVACY_FIELDS.filter(({ capability }) => !capability || supportsGameFeature(game, capability)).map(({ key, labelKey }) => {
        const id = `${idPrefix}-${key}`;
        return (
          <SettingsField
            key={key}
            layout="inline"
            htmlFor={id}
            label={t(`settings.profile.privacy.${labelKey}.label`)}
            description={t(`settings.profile.privacy.${labelKey}.description`, { game: game.brand.displayName })}
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
