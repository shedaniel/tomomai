import type { CanonicalGameId } from "@/lib/games/ids";
import type { RecentItem } from "./types";

const MAX_RECENTS = 8;
const storageKey = (game: CanonicalGameId) => `tomomai:command-palette:recent:${game}`;

function isRecentItem(value: unknown): value is RecentItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.title === "string" && typeof item.href === "string" && (item.kind === "song" || item.kind === "page");
}

export function readRecents(game: CanonicalGameId): RecentItem[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey(game)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isRecentItem).slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

export function rememberRecent(game: CanonicalGameId, item: RecentItem): RecentItem[] {
  const next = [item, ...readRecents(game).filter(recent => recent.id !== item.id)].slice(0, MAX_RECENTS);
  try {
    window.localStorage.setItem(storageKey(game), JSON.stringify(next));
  } catch {
    // Private windows and blocked storage just don't keep a history.
  }
  return next;
}

export function clearRecents(game: CanonicalGameId): void {
  try {
    window.localStorage.removeItem(storageKey(game));
  } catch {
    // Nothing was stored.
  }
}
