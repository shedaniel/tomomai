/**
 * Client- and server-safe heardle configuration. Lives apart from
 * `heardle.ts` so client bundles don't pull in `apple-music-previews.json`
 * (which lives in the heavier data module).
 */
import type { Hint } from "./types";

export type Mode = "guess" | "heardle";

/**
 * Mode read from `NEXT_PUBLIC_GUESSER_MODE`. The `NEXT_PUBLIC_` prefix is
 * required so the value survives into the client bundle — the same string
 * needs to be visible to both the server (pool filter, OG image, share
 * builder) and the client (ShareButton text, future heardle-only UI).
 */
export function getMode(): Mode {
  return process.env.NEXT_PUBLIC_GUESSER_MODE === "heardle" ? "heardle" : "guess";
}

export function isHeardle(): boolean {
  return getMode() === "heardle";
}

/**
 * Audio clip durations (seconds) per hint level. L0..L6 = 7 hint cards;
 * L6 (30s) is the full Apple Music preview. The reveal card replays L6.
 */
export const AUDIO_DURATIONS: readonly number[] = [1, 2, 4, 7, 11, 16, 30];

export const FULL_PREVIEW_SEC = 30;

export function audioDurationFor(level: number): number {
  return AUDIO_DURATIONS[Math.min(level, AUDIO_DURATIONS.length - 1)]!;
}

/** Heardle's deterministic plan: each card unlocks a longer audio clip. */
export function buildHeardlePlan(maxHints: number): Hint[] {
  const plan: Hint[] = [];
  for (let i = 0; i < maxHints; i++) {
    const level = Math.min(i, AUDIO_DURATIONS.length - 1) as
      | 0
      | 1
      | 2
      | 3
      | 4
      | 5
      | 6;
    plan.push({ kind: "audio", level });
  }
  return plan;
}
