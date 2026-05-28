import type { Chart } from "./types";
import previewsData from "../data/apple-music-previews.json";

// Re-export the client-safe surface so existing server imports keep working
// without churn. Client code should import from `./heardle-config` directly
// to avoid bundling the previews JSON.
export {
  AUDIO_DURATIONS,
  FULL_PREVIEW_SEC,
  audibleAudioDuration,
  audioDurationFor,
  audioModifier,
  buildHeardlePlan,
  getMode,
  isHeardle,
  sourceAudioDuration,
} from "./heardle-config";
export type { AudioModifier, AudioModifierKind, Mode } from "./heardle-config";
export { getPuzzleVersion } from "./puzzle-version";
export type { PuzzleVersion } from "./puzzle-version";

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
