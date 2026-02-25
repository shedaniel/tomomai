import { flag } from "flags/next";

export interface Flags {
  newTokenDialog: boolean;
  historyCard: boolean;
  recommendationFilters: boolean;
  platesCard: boolean;
  eventsCard: boolean;
  albumsCard: boolean;
}

export interface FlagDefinition {
  key: keyof Flags;
  defaultValue: boolean;
  userSelectable: boolean;
  decide: () => Promise<boolean>;
}

export const useFlags = async (): Promise<Flags> => {
  return {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    newTokenDialog: await useNewTokenDialog(),
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
  };
}

export const flagDefinitions: Record<keyof Flags, FlagDefinition> = {
  newTokenDialog: {
    key: "newTokenDialog",
    defaultValue: true,
    userSelectable: true,
    decide: async () => true,
  },
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
    defaultValue: false,
    userSelectable: true,
    decide: async () => false,
  },
  albumsCard: {
    key: "albumsCard",
    defaultValue: true,
    userSelectable: true,
    decide: async () => true,
  },
};

export const defaultFlags: Flags = Object.fromEntries(Object.entries(flagDefinitions).map(([key, value]) => [key, value.defaultValue])) as unknown as Flags;

export const useNewTokenDialog = flag<boolean>({
  key: "newTokenDialog",
  defaultValue: true,
  async decide() {
    return true;
  },
});

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
  defaultValue: false,
  async decide() {
    return false;
  },
});

export const useAlbumsCard = flag<boolean>({
  key: "albumsCard",
  defaultValue: true,
  async decide() {
    return true;
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
