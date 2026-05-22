import { flag } from "flags/next";
import type { cookies } from "next/headers";
import { isAprilFools2026JST } from "@/lib/april-fools";

export interface Flags {
  historyCard: boolean;
  recommendationFilters: boolean;
  platesCard: boolean;
  eventsCard: boolean;
  albumsCard: boolean;
  settingsApplications: boolean;
  settingsDeveloper: boolean;
  aprilFools2026: boolean;
  customThemes: boolean;
}

export interface FlagDefinition {
  key: keyof Flags;
  defaultValue: boolean;
  userSelectable: boolean;
  decide: () => Promise<boolean>;
}

type RawFlagConfig = {
  defaultValue: boolean;
  userSelectable: boolean;
  decide: () => Promise<boolean>;
};

type DefinedFlag = {
  config: FlagDefinition;
  fn: ReturnType<typeof flag<boolean>>;
};

function defineFlag(key: keyof Flags, cfg: RawFlagConfig): DefinedFlag {
  return {
    config: { key, ...cfg },
    fn: flag<boolean>({ key, defaultValue: cfg.defaultValue, decide: cfg.decide }),
  };
}

const registry = {
  historyCard: defineFlag("historyCard", {
    defaultValue: false,
    userSelectable: true,
    decide: async () => false,
  }),
  recommendationFilters: defineFlag("recommendationFilters", {
    defaultValue: true,
    userSelectable: true,
    decide: async () => true,
  }),
  platesCard: defineFlag("platesCard", {
    defaultValue: false,
    userSelectable: false,
    decide: async () => false,
  }),
  eventsCard: defineFlag("eventsCard", {
    defaultValue: true,
    userSelectable: true,
    decide: async () => true,
  }),
  albumsCard: defineFlag("albumsCard", {
    defaultValue: true,
    userSelectable: true,
    decide: async () => true,
  }),
  settingsApplications: defineFlag("settingsApplications", {
    defaultValue: false,
    userSelectable: true,
    decide: async () => false,
  }),
  settingsDeveloper: defineFlag("settingsDeveloper", {
    defaultValue: false,
    userSelectable: true,
    decide: async () => false,
  }),
  aprilFools2026: defineFlag("aprilFools2026", {
    defaultValue: false,
    userSelectable: true,
    decide: async () => isAprilFools2026JST(),
  }),
  customThemes: defineFlag("customThemes", {
    defaultValue: false,
    userSelectable: true,
    decide: async () => false,
  }),
} satisfies Record<keyof Flags, DefinedFlag>;

export const flagDefinitions = Object.fromEntries(
  Object.entries(registry).map(([k, v]) => [k, v.config]),
) as Record<keyof Flags, FlagDefinition>;

export const defaultFlags: Flags = Object.fromEntries(
  Object.entries(registry).map(([k, v]) => [k, v.config.defaultValue]),
) as unknown as Flags;

export const useFlags0 = async (): Promise<Flags> => {
  return Object.fromEntries(
    await Promise.all(Object.entries(registry).map(async ([k, v]) => [k, await v.fn()])),
  ) as Flags;
};

// Named exports required for Vercel Flags SDK discovery
export const useHistoryCard = registry.historyCard.fn;
export const useRecommendationFilters = registry.recommendationFilters.fn;
export const usePlatesCard = registry.platesCard.fn;
export const useEventsCard = registry.eventsCard.fn;
export const useAlbumsCard = registry.albumsCard.fn;
export const useSettingsApplications = registry.settingsApplications.fn;
export const useSettingsDeveloper = registry.settingsDeveloper.fn;
export const useAprilFools2026 = registry.aprilFools2026.fn;
export const useCustomThemes = registry.customThemes.fn;

export function applyFlagOverrides(flags: Flags, cookieValue?: string): Flags {
  if (!cookieValue) {
    return flags;
  }

  try {
    const overrides = JSON.parse(cookieValue) as Partial<Flags>;

    const result = { ...flags };
    for (const [key, value] of Object.entries(overrides)) {
      const flagKey = key as keyof Flags;
      if (flagDefinitions[flagKey]?.userSelectable) {
        result[flagKey] = value as boolean;
      }
    }

    return result;
  } catch {
    return flags;
  }
}

export async function useFlags(cookiesFunc: typeof cookies): Promise<Flags> {
  const flags = await useFlags0();
  const cookieStore = await cookiesFunc();
  const flagOverridesCookie = cookieStore.get("flagOverrides")?.value;
  return applyFlagOverrides(flags, flagOverridesCookie);
}
