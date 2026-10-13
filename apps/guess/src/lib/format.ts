import { AUDIO_DURATIONS } from "./heardle-config";

const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

/** `HH:MM:SS` clock time for an offset from 00:00 JST, wrapping past a day. */
export function formatClock(msSinceStart: number): string {
  const total = Math.max(0, Math.floor((msSinceStart % DAY_MS) / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** Whole days a late solve came in after its puzzle day ended (min 1). */
export function daysLate(msSinceStart: number): number {
  return Math.max(1, Math.floor(msSinceStart / DAY_MS));
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${pad(s % 60)}s`;
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}

/** Heardle measures a solve by audio heard rather than hint count. */
export function audioSecondsFor(hintsUsed: number): number {
  return AUDIO_DURATIONS[Math.min(hintsUsed, AUDIO_DURATIONS.length) - 1] ?? 0;
}
