/**
 * Client- and server-safe heardle configuration. Lives apart from
 * `heardle.ts` so client bundles don't pull in `apple-music-previews.json`
 * (which lives in the heavier data module).
 */
import type { Hint } from "./types";
import type { PuzzleVersion } from "./puzzle-version";

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

// ---------- audio durations -----------------------------------------------

/**
 * Audio clip durations (seconds) per hint level. L0..L6 = 7 hint cards;
 * L6 (30s) is the full Apple Music preview. The reveal card replays L6.
 *
 * v1 and v2 share the same base durations. v2's added difficulty comes from
 * the per-level modifier (see `audioModifierFor`), which may swap the clip
 * for a shorter plain version or apply reverse/pitch transforms.
 */
export const AUDIO_DURATIONS: readonly number[] = [1, 2, 4, 7, 11, 16, 30];

export const FULL_PREVIEW_SEC = 30;

export function audioDurationFor(level: number): number {
  return AUDIO_DURATIONS[Math.min(level, AUDIO_DURATIONS.length - 1)]!;
}

// ---------- modifiers (v2 only) -------------------------------------------

/**
 * v2 makes the first three hints harder by attaching a per-level modifier.
 * Each level rolls independently between three variants:
 *   - `plain`: half the v1 duration, no effect
 *   - `speed`: full v1 duration audible, tempo 0.5× (slowed) or 2× (sped up)
 *   - `pitch`: full v1 duration, pitch-shifted by ±2 semitones (no 0)
 *
 * L3..L6 always render as `plain` with the full v1 duration (no modifier).
 */
export type AudioModifierKind = "plain" | "speed" | "pitch";

export type AudioModifier =
  | { kind: "plain" }
  | { kind: "speed"; rate: 0.5 | 2 }
  | { kind: "pitch"; semitones: number };

/** Half-duration values used for the v2 `plain` variant on L0..L2. */
const V2_PLAIN_HALF_DURATIONS: readonly number[] = [0.5, 1, 2];

/** Highest level that gets a v2 modifier. L3..L6 stay plain at full duration. */
const V2_MODIFIER_MAX_LEVEL = 2;

/**
 * Compute the modifier for a (version, level) from two pre-drawn rolls.
 * Returns `{ kind: "plain" }` for v1, or for v2 levels outside the modifier
 * range. Callers seed the rolls — keeps this module free of `node:crypto`
 * so it stays client-safe.
 *
 * - `variantRoll`: any non-negative integer; reduced mod 3 to pick variant.
 * - `subRoll`    : any non-negative integer; reduced mod 2. Picks rate
 *   (0.5× vs 2×) for speed, or sign (−2 vs +2) for pitch. Ignored on plain.
 */
export function audioModifier(
  version: PuzzleVersion,
  level: number,
  variantRoll: number,
  subRoll: number,
): AudioModifier {
  if (version !== 2) return { kind: "plain" };
  if (level > V2_MODIFIER_MAX_LEVEL) return { kind: "plain" };
  const variant = variantRoll % 3;
  if (variant === 0) return { kind: "plain" };
  if (variant === 1) {
    return { kind: "speed", rate: subRoll % 2 === 0 ? 0.5 : 2 };
  }
  const sign = subRoll % 2 === 0 ? -1 : 1;
  return { kind: "pitch", semitones: 2 * sign };
}

/**
 * Length of source preview fed into the pipeline. v2's `plain` variant on
 * L0..L2 uses the half-duration; every other modifier (and v1) uses the
 * full v1 duration. This is also what the UI displays as "the clip length"
 * — for speed, the user sees this number even though the audible playback
 * is longer or shorter (see `audibleAudioDuration`).
 */
export function sourceAudioDuration(
  level: number,
  modifier: AudioModifier,
  version: PuzzleVersion,
): number {
  if (
    version === 2 &&
    modifier.kind === "plain" &&
    level <= V2_MODIFIER_MAX_LEVEL &&
    level < V2_PLAIN_HALF_DURATIONS.length
  ) {
    return V2_PLAIN_HALF_DURATIONS[level]!;
  }
  return audioDurationFor(level);
}

/**
 * Actual playback length in seconds. Equals `sourceAudioDuration` for every
 * modifier except `speed`, which stretches (0.5×) or compresses (2×) the
 * source so the user hears more or less wall-clock audio of the same clip.
 */
export function audibleAudioDuration(
  level: number,
  modifier: AudioModifier,
  version: PuzzleVersion,
): number {
  const src = sourceAudioDuration(level, modifier, version);
  if (modifier.kind === "speed") return src / modifier.rate;
  return src;
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
