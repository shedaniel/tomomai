/**
 * Player progress persisted to localStorage. Lives in its own module (rather
 * than inside GameClient) so the shape is unit-testable and the LS_KEY suffix
 * is colocated with the type definition that drives it.
 */

export type StepResult = "correct" | "incorrect" | "skipped";

export type Persisted = {
  dateKey: string;
  /** Index of the next hint to fetch — revealed steps = 0..step-1. */
  step: number;
  /** Action taken at each hint (results[i] = action at hint i). */
  results: StepResult[];
  won: boolean;
};

// Bump suffix when the persisted shape changes — older versions fall through
// to `blankProgress()` and the player starts fresh.
const LS_KEY = "tomomai.guess.progress.v2";

export function blankProgress(dateKey: string): Persisted {
  return { dateKey, step: 1, results: [], won: false };
}

export function loadProgress(dateKey: string): Persisted {
  if (typeof window === "undefined") return blankProgress(dateKey);
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return blankProgress(dateKey);
    const p = JSON.parse(raw) as Persisted;
    if (p.dateKey !== dateKey) return blankProgress(dateKey);
    if (!Array.isArray(p.results)) return blankProgress(dateKey);
    return p;
  } catch {
    return blankProgress(dateKey);
  }
}

export function saveProgress(p: Persisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    // Ignore quota / privacy errors — the in-memory state still drives the UI.
  }
}
