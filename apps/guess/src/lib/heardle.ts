import type { Chart, Hint } from "./types";
import previewsData from "../data/apple-music-previews.json";

/**
 * Audio clip durations (seconds) per hint level. L0..L6 = 7 hint cards;
 * L6 (30s) is the entire Apple Music preview. The reveal card replays the
 * same 30s clip.
 */
export const AUDIO_DURATIONS: readonly number[] = [1, 2, 4, 7, 11, 16, 30];

/** Full preview length played on the reveal card. */
export const FULL_PREVIEW_SEC = 30;

export function isHeardle(): boolean {
  return process.env.GUESSER_MODE === "heardle";
}

export type PreviewEntry = {
  previewUrl: string;
  trackId?: number;
  trackName?: string;
  artistName?: string;
  artworkUrl?: string | null;
  matchConfidence?: "exact" | "loose" | "fuzzy";
};

type PreviewsFile = {
  songs: Record<string, PreviewEntry>;
};

const previews = previewsData as PreviewsFile;

function previewKey(chart: Pick<Chart, "songName" | "artist">): string {
  return `${chart.songName}|${chart.artist}`;
}

export function getAudioPreview(chart: Pick<Chart, "songName" | "artist">): PreviewEntry | null {
  return previews.songs[previewKey(chart)] ?? null;
}

export function hasAudioPreview(chart: Pick<Chart, "songName" | "artist">): boolean {
  return previewKey(chart) in previews.songs;
}

/** Heardle's deterministic plan: each hint card unlocks a longer audio clip. */
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

export function audioDurationFor(level: number): number {
  return AUDIO_DURATIONS[Math.min(level, AUDIO_DURATIONS.length - 1)]!;
}
