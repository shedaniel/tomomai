"use client";

import { useGame } from "@/components/providers/game-provider";
import { SettingsField } from "@/components/settings/primitives";
import { supportsGameFeature } from "@/lib/games/frontend";
import type { GameCapability } from "@/lib/games/types";
import {
  PROFILE_AUDIENCES,
  PROFILE_PART_AUDIENCES,
  capAudience,
  type ProfileAudience,
  type ProfileAudienceSettings,
  type ProfilePart,
} from "@/lib/profile-audience";
import { Switch } from "@tomomai/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tomomai/ui/select-friendly";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";

/** A part whose feature the served game does not offer is hidden, and its stored audience is kept. */
export const PROFILE_PRIVACY_FIELDS: readonly { key: ProfilePart; labelKey: string; capability?: GameCapability }[] = [
  { key: "profileShowAllScores", labelKey: "showAllScores" },
  { key: "profileShowScoreDetails", labelKey: "showScoreDetails" },
  { key: "profileShowPlates", labelKey: "showPlates", capability: "plates" },
  { key: "profileShowPlayCounts", labelKey: "showPlayCounts" },
  { key: "profileShowEvents", labelKey: "showEvents", capability: "events" },
];

const RANK = Object.fromEntries(PROFILE_AUDIENCES.map((audience, index) => [audience, index])) as Record<ProfileAudience, number>;

function AudienceSelect({ id, value, cap, onChange, disabled, detailed }: {
  id: string;
  value: ProfileAudience;
  cap?: ProfileAudience;
  onChange(value: ProfileAudience): void;
  disabled?: boolean;
  detailed?: boolean;
}) {
  const t = useTranslations("settings.profile.visibility");
  const shown = cap ? capAudience(value, cap) : value;
  return (
    <Select value={shown} onValueChange={next => onChange(next as ProfileAudience)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full bg-background">
        <SelectValue>{t(`${shown}.label`)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PROFILE_AUDIENCES.filter(audience => !cap || RANK[audience] <= RANK[cap]).map(audience => (
          <SelectItem key={audience} value={audience}>
            {detailed ? (
              <div className="grid text-left">
                <span>{t(`${audience}.label`)}</span>
                <span className="text-xs text-muted-foreground">{t(`${audience}.description`)}</span>
              </div>
            ) : t(`${audience}.label`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Who may open the profile at all. */
export function ProfileVisibilityField({ value, onChange, disabled, id = "profile-visibility" }: {
  value: ProfileAudience;
  onChange(value: ProfileAudience): void;
  disabled?: boolean;
  id?: string;
}) {
  const t = useTranslations();
  const game = useGame();
  return (
    <SettingsField
      icon={Globe}
      label={t("settings.profile.visibility.label")}
      description={t("settings.profile.visibility.description", { game: game.brand.displayName })}
      htmlFor={id}
    >
      <AudienceSelect id={id} value={value} onChange={onChange} disabled={disabled} detailed />
    </SettingsField>
  );
}

interface ProfilePrivacyFieldsProps {
  value: ProfileAudienceSettings;
  onChange(value: ProfileAudienceSettings): void;
  disabled?: boolean;
  idPrefix?: string;
}

/** Who may see each part of the profile, up to who may open it, and whether a public profile is listed. */
export function ProfilePrivacyFields({ value, onChange, disabled = false, idPrefix = "profile-privacy" }: ProfilePrivacyFieldsProps) {
  const t = useTranslations();
  const game = useGame();

  return (
    <div className="grid gap-3">
      {PROFILE_PRIVACY_FIELDS.filter(({ capability }) => !capability || supportsGameFeature(game, capability)).map(({ key, labelKey }) => {
        const id = `${idPrefix}-${key}`;
        const audienceKey = PROFILE_PART_AUDIENCES[key];
        return (
          <SettingsField
            key={key}
            layout="inline"
            htmlFor={id}
            label={t(`settings.profile.privacy.${labelKey}.label`)}
            description={t(`settings.profile.privacy.${labelKey}.description`)}
            labelClassName="text-sm font-normal"
            action={
              <div className="w-40 shrink-0">
                <AudienceSelect
                  id={id}
                  value={value[audienceKey]}
                  cap={value.profileVisibility}
                  onChange={audience => onChange({ ...value, [audienceKey]: audience })}
                  disabled={disabled}
                />
              </div>
            }
          />
        );
      })}
      {value.profileVisibility === "public" && (
        <SettingsField
          layout="inline"
          htmlFor={`${idPrefix}-search`}
          label={t("settings.profile.privacy.showInSearch.label")}
          description={t("settings.profile.privacy.showInSearch.description")}
          labelClassName="text-sm font-normal"
          action={
            <Switch
              id={`${idPrefix}-search`}
              checked={value.profileShowInSearch}
              onCheckedChange={checked => onChange({ ...value, profileShowInSearch: checked })}
              disabled={disabled}
            />
          }
        />
      )}
    </div>
  );
}

export function profileAudiencesOf(settings: ProfileAudienceSettings): ProfileAudienceSettings {
  return {
    profileVisibility: settings.profileVisibility,
    profileAllScoresAudience: settings.profileAllScoresAudience,
    profileScoreDetailsAudience: settings.profileScoreDetailsAudience,
    profilePlatesAudience: settings.profilePlatesAudience,
    profilePlayCountsAudience: settings.profilePlayCountsAudience,
    profileEventsAudience: settings.profileEventsAudience,
    profileShowInSearch: settings.profileShowInSearch,
  };
}

export function profileAudiencesEqual(left: ProfileAudienceSettings, right: ProfileAudienceSettings): boolean {
  return (Object.keys(profileAudiencesOf(left)) as (keyof ProfileAudienceSettings)[]).every(key => left[key] === right[key]);
}
