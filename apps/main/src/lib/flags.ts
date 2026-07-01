import { dedupe, flag } from "flags/next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema-pg";
import { getServerSession } from "@/lib/auth-server";
import { isAprilFools2026JST } from "@/lib/april-fools";

export interface Flags {
  // dashboard
  historyCard: boolean;
  platesCard: boolean;
  eventsCard: boolean;
  albumsCard: boolean;
  recommendationFilters: boolean;
  // profile
  scorePercentile: boolean;
  // settings
  settingsApplications: boolean;
  settingsDeveloper: boolean;
  // theming
  aprilFools2026: boolean;
  customThemes: boolean;
  // auth
  passkey: boolean;
  twitterOauth: boolean;
  // developer
  developerPortal: boolean;
  apiKeyCreation: boolean;
  oauthAppCreation: boolean;
  userscriptFetch: boolean;
}

export interface FlagContext {
  userId: string | null;
  role: string | null;
  overrides: Partial<Flags>;
}

export type FlagCategory =
  | "dashboard"
  | "profile"
  | "settings"
  | "theming"
  | "developer"
  | "auth";

export const FLAG_CATEGORY_ORDER: readonly FlagCategory[] = [
  "dashboard",
  "profile",
  "settings",
  "theming",
  "auth",
  "developer",
];

export interface FlagDefinition {
  key: keyof Flags;
  defaultValue: boolean;
  userSelectable: boolean;
  category: FlagCategory;
}

type RawFlagConfig = {
  defaultValue: boolean;
  userSelectable: boolean;
  category: FlagCategory;
  decide: (ctx: FlagContext) => boolean | Promise<boolean>;
};

type DefinedFlag = {
  config: FlagDefinition;
  fn: ReturnType<typeof flag<boolean, FlagContext>>;
  decide: (ctx: FlagContext) => boolean | Promise<boolean>;
};

const identifyFlagContext = dedupe(async (): Promise<FlagContext> => {
  const session = await getServerSession();
  if (!session?.user) {
    return { userId: null, role: null, overrides: {} };
  }
  const row = await db.query.user.findFirst({
    where: eq(user.id, session.user.id),
    columns: { id: true, role: true, flagOverrides: true },
  });
  return {
    userId: row?.id ?? session.user.id,
    role: row?.role ?? null,
    overrides: (row?.flagOverrides as Partial<Flags> | null) ?? {},
  };
});

function defineFlag(key: keyof Flags, cfg: RawFlagConfig): DefinedFlag {
  return {
    config: { key, defaultValue: cfg.defaultValue, userSelectable: cfg.userSelectable, category: cfg.category },
    decide: cfg.decide,
    fn: flag<boolean, FlagContext>({
      key,
      defaultValue: cfg.defaultValue,
      // Only userSelectable flags need to look up the user + DB overrides.
      // Skipping identify for the rest avoids a needless session/DB hit per
      // request (and avoids re-entry when called from inside the Better Auth
      // middleware in @/lib/auth.ts).
      ...(cfg.userSelectable ? { identify: identifyFlagContext } : {}),
      decide: async ({ entities }) => {
        const ctx: FlagContext = entities ?? { userId: null, role: null, overrides: {} };
        if (cfg.userSelectable && ctx.overrides[key] != null) {
          return ctx.overrides[key]!;
        }
        return cfg.decide(ctx);
      },
    }),
  };
}

const registry = {
  // ── dashboard ────────────────────────────────────────────────────────────
  historyCard: defineFlag("historyCard", {
    defaultValue: false,
    userSelectable: true,
    category: "dashboard",
    decide: () => false,
  }),
  platesCard: defineFlag("platesCard", {
    defaultValue: false,
    userSelectable: false,
    category: "dashboard",
    decide: () => false,
  }),
  eventsCard: defineFlag("eventsCard", {
    defaultValue: true,
    userSelectable: true,
    category: "dashboard",
    decide: () => true,
  }),
  albumsCard: defineFlag("albumsCard", {
    defaultValue: true,
    userSelectable: true,
    category: "dashboard",
    decide: () => true,
  }),
  recommendationFilters: defineFlag("recommendationFilters", {
    defaultValue: true,
    userSelectable: true,
    category: "dashboard",
    decide: () => true,
  }),

  // ── profile ──────────────────────────────────────────────────────────────
  scorePercentile: defineFlag("scorePercentile", {
    defaultValue: false,
    userSelectable: true,
    category: "profile",
    decide: () => false,
  }),

  // ── settings ─────────────────────────────────────────────────────────────
  settingsApplications: defineFlag("settingsApplications", {
    defaultValue: false,
    userSelectable: true,
    category: "settings",
    decide: () => false,
  }),
  settingsDeveloper: defineFlag("settingsDeveloper", {
    defaultValue: false,
    userSelectable: true,
    category: "settings",
    decide: () => false,
  }),

  // ── theming ──────────────────────────────────────────────────────────────
  aprilFools2026: defineFlag("aprilFools2026", {
    defaultValue: false,
    userSelectable: true,
    category: "theming",
    decide: () => isAprilFools2026JST(),
  }),
  customThemes: defineFlag("customThemes", {
    defaultValue: false,
    userSelectable: true,
    category: "theming",
    decide: () => false,
  }),

  // ── auth ─────────────────────────────────────────────────────────────────
  passkey: defineFlag("passkey", {
    defaultValue: true,
    userSelectable: true,
    category: "auth",
    decide: () => true,
  }),
  twitterOauth: defineFlag("twitterOauth", {
    defaultValue: true,
    userSelectable: true,
    category: "auth",
    decide: () => true,
  }),

  // ── developer ────────────────────────────────────────────────────────────
  developerPortal: defineFlag("developerPortal", {
    defaultValue: false,
    userSelectable: true,
    category: "developer",
    decide: () => false,
  }),
  apiKeyCreation: defineFlag("apiKeyCreation", {
    defaultValue: false,
    userSelectable: false,
    category: "developer",
    decide: () => false,
  }),
  oauthAppCreation: defineFlag("oauthAppCreation", {
    defaultValue: false,
    userSelectable: false,
    category: "developer",
    decide: () => false,
  }),
  userscriptFetch: defineFlag("userscriptFetch", {
    defaultValue: false,
    userSelectable: false,
    category: "developer",
    decide: () => false,
  }),
} satisfies Record<keyof Flags, DefinedFlag>;

export const flagDefinitions = Object.fromEntries(
  Object.entries(registry).map(([k, v]) => [k, v.config]),
) as Record<keyof Flags, FlagDefinition>;

export const defaultFlags: Flags = Object.fromEntries(
  Object.entries(registry).map(([k, v]) => [k, v.config.defaultValue]),
) as unknown as Flags;

export const useFlags = async (): Promise<Flags> => {
  return Object.fromEntries(
    await Promise.all(Object.entries(registry).map(async ([k, v]) => [k, await v.fn()])),
  ) as Flags;
};

// Resolve flags from the user's DB row without an HTTP session, so non-request
// call sites (e.g. the Discord fetch command) honor flagOverrides like the web.
export async function resolveFlagsForUser(userId: string): Promise<Flags> {
  const row = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { id: true, role: true, flagOverrides: true },
  });
  const ctx: FlagContext = {
    userId: row?.id ?? userId,
    role: row?.role ?? null,
    overrides: (row?.flagOverrides as Partial<Flags> | null) ?? {},
  };
  const result = {} as Flags;
  await Promise.all(
    Object.entries(registry).map(async ([key, defined]) => {
      const flagKey = key as keyof Flags;
      const value = defined.config.userSelectable && ctx.overrides[flagKey] != null
        ? ctx.overrides[flagKey]!
        : await defined.decide(ctx);
      result[flagKey] = value;
    }),
  );
  return result;
}

// Named exports required for Vercel Flags SDK discovery
// dashboard
export const useHistoryCard = registry.historyCard.fn;
export const usePlatesCard = registry.platesCard.fn;
export const useEventsCard = registry.eventsCard.fn;
export const useAlbumsCard = registry.albumsCard.fn;
export const useRecommendationFilters = registry.recommendationFilters.fn;
// profile
export const useScorePercentile = registry.scorePercentile.fn;
// settings
export const useSettingsApplications = registry.settingsApplications.fn;
export const useSettingsDeveloper = registry.settingsDeveloper.fn;
// theming
export const useAprilFools2026 = registry.aprilFools2026.fn;
export const useCustomThemes = registry.customThemes.fn;
// auth
export const usePasskey = registry.passkey.fn;
export const useTwitterOauth = registry.twitterOauth.fn;
// developer
export const useDeveloperPortal = registry.developerPortal.fn;
export const useApiKeyCreation = registry.apiKeyCreation.fn;
export const useOauthAppCreation = registry.oauthAppCreation.fn;
export const useUserscriptFetch = registry.userscriptFetch.fn;
