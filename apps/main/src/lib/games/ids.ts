// drizzle-kit (through schema-pg.ts), eslint.config.mjs and scripts/register-discord-commands.js load this
// directly, so it must stay free of imports.

export const CANONICAL_GAME_IDS = ["maimai", "chunithm"] as const;
export type CanonicalGameId = (typeof CANONICAL_GAME_IDS)[number];

export const REGIONS = ["intl", "jp", "cn"] as const;
export type Region = (typeof REGIONS)[number];

export const DEFAULT_FRONTEND_GAME: CanonicalGameId = "maimai";
