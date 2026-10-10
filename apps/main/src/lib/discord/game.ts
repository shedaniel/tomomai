import type { CanonicalGameId } from "@/lib/games/ids";

/** The bot serves one game, so every command reads and fetches this one. */
export const DISCORD_GAME = "maimai" as const satisfies CanonicalGameId;
