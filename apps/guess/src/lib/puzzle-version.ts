/**
 * Versioning for daily puzzle generation. Versions exist so we can make the
 * game harder over time without changing past challenges — each feature
 * branches on the puzzle's version (derived purely from its dateKey) to
 * decide which behaviour to run.
 *
 * Adding a v3 later: define a `V3_START_DATE`, add the `3` literal to the
 * union, and extend `getPuzzleVersion`. Per-feature constants live with the
 * feature (`OLDNESS_CAP_V2` in daily.ts, modifier tables in heardle-config),
 * keeping this module narrow.
 *
 * Client- and server-safe — no node-only imports.
 */

export type PuzzleVersion = 1 | 2;

/**
 * First JST dateKey that runs v2 generation. Dates strictly before this stay
 * on v1 so previously-played puzzles never change. Debug keys always run the
 * latest version so local development exercises the newest logic.
 */
const V2_START_DATE = "2026-05-30";

export function getPuzzleVersion(dateKey: string): PuzzleVersion {
  if (dateKey.startsWith("debug-")) return 2;
  return dateKey >= V2_START_DATE ? 2 : 1;
}
