import { flag } from "flags/next";
import type { cookies } from "next/headers";


export interface Flags {
  historyCard: boolean;
  recommendationFilters: boolean;
  platesCard: boolean;
  eventsCard: boolean;
  albumsCard: boolean;
  developerPortal: boolean;
}

export interface FlagDefinition {
  key: keyof Flags;
  defaultValue: boolean;
  userSelectable: boolean;
  decide: () => Promise<boolean>;
}

export const useFlags0 = async (): Promise<Flags> => {
  return {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    historyCard: await useHistoryCard(),
    // eslint-disable-next-line react-hooks/rules-of-hooks
    recommendationFilters: await useRecommendationFilters(),
    // eslint-disable-next-line react-hooks/rules-of-hooks
    platesCard: await usePlatesCard(),
    // eslint-disable-next-line react-hooks/rules-of-hooks
    eventsCard: await useEventsCard(),
    // eslint-disable-next-line react-hooks/rules-of-hooks
    albumsCard: await useAlbumsCard(),
    // eslint-disable-next-line react-hooks/rules-of-hooks
    developerPortal: await useDeveloperPortal(),
  };
}

export const flagDefinitions: Record<keyof Flags, FlagDefinition> = {
  historyCard: {
    key: "historyCard",
    defaultValue: false,
    userSelectable: true,
    decide: async () => false,
  },
  recommendationFilters: {
    key: "recommendationFilters",
    defaultValue: true,
    userSelectable: true,
    decide: async () => true,
  },
  platesCard: {
    key: "platesCard",
    defaultValue: false,
    userSelectable: false,
    decide: async () => false,
  },
  eventsCard: {
    key: "eventsCard",
    defaultValue: true,
    userSelectable: true,
    decide: async () => true,
  },
  albumsCard: {
    key: "albumsCard",
    defaultValue: true,
    userSelectable: true,
    decide: async () => true,
  },
  developerPortal: {
    key: "developerPortal",
    defaultValue: false,
    userSelectable: false,
    decide: async () => false,
  },
};

export const defaultFlags: Flags = Object.fromEntries(Object.entries(flagDefinitions).map(([key, value]) => [key, value.defaultValue])) as unknown as Flags;

export const useHistoryCard = flag<boolean>({
  key: "historyCard",
  defaultValue: false,
  async decide() {
    return false;
  },
});

export const useRecommendationFilters = flag<boolean>({
  key: "recommendationFilters",
  defaultValue: true,
  async decide() {
    return true;
  },
});

export const useStatsCard = flag<boolean>({
  key: "statsCard",
  defaultValue: false,
  async decide() {
    return false;
  },
});

export const usePlatesCard = flag<boolean>({
  key: "platesCard",
  defaultValue: false,
  async decide() {
    return false;
  },
});

export const useEventsCard = flag<boolean>({
  key: "eventsCard",
  defaultValue: true,
  async decide() {
    return true;
  },
});

export const useAlbumsCard = flag<boolean>({
  key: "albumsCard",
  defaultValue: true,
  async decide() {
    return true;
  },
});

export const useDeveloperPortal = flag<boolean>({
  key: "developerPortal",
  defaultValue: false,
  async decide() {
    return false;
  },
});

/**
 * Merge flag overrides from cookies with default flags
 * Overrides are stored in the flagOverrides cookie as JSON
 */
export function applyFlagOverrides(flags: Flags, cookieValue?: string): Flags {
  if (!cookieValue) {
    return flags;
  }

  try {
    const overrides = JSON.parse(cookieValue) as Partial<Flags>;

    // Only apply overrides for user-selectable flags
    const result = { ...flags };
    for (const [key, value] of Object.entries(overrides)) {
      const flagKey = key as keyof Flags;
      if (flagDefinitions[flagKey]?.userSelectable) {
        result[flagKey] = value as boolean;
      }
    }

    return result;
  } catch {
    // If cookie is malformed, just return original flags
    return flags;
  }
}

export async function useFlags(cookiesFunc: typeof cookies): Promise<Flags> {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  let flags = await useFlags0();

  // Apply flag overrides from cookies
  const cookieStore = await cookiesFunc();
  const flagOverridesCookie = cookieStore.get("flagOverrides")?.value;
  return applyFlagOverrides(flags, flagOverridesCookie);
}
