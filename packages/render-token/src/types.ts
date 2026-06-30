/**
 * Domain types used by the render token codec.
 *
 * Kept dependency-free (no @tomomai/* imports) so this package stays a leaf
 * with zero workspace coupling — easy to lift into a Rust port later.
 */

export type Region = "intl" | "jp" | "cn";

export type Difficulty =
  | "basic"
  | "advanced"
  | "expert"
  | "master"
  | "remaster"
  | "utage";

export type FullCombo = "none" | "fc" | "fc+" | "ap" | "ap+";

export type FullSync = "none" | "sync" | "fs" | "fs+" | "fdx" | "fdx+";

export type TitleType = "normal" | "bronze" | "silver" | "gold" | "rainbow";

/** A single note-type's judgment tallies. */
export interface NoteCounts {
  criticalPerfect: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
}

// ---- Enum orderings (MUST match the binary spec — indexes are wire values) ----

export const REGIONS: readonly Region[] = ["intl", "jp", "cn"];
export const DIFFICULTIES: readonly Difficulty[] = [
  "basic",
  "advanced",
  "expert",
  "master",
  "remaster",
  "utage",
];
export const FULL_COMBOS: readonly FullCombo[] = ["none", "fc", "fc+", "ap", "ap+"];
export const FULL_SYNCS: readonly FullSync[] = ["none", "sync", "fs", "fs+", "fdx", "fdx+"];
export const TITLE_TYPES: readonly TitleType[] = [
  "normal",
  "bronze",
  "silver",
  "gold",
  "rainbow",
];

export type Route = "export-image" | "last-credit" | "daily-plays";
