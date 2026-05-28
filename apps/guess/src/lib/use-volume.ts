"use client";

import { useEffect, useState } from "react";

const KEY = "tomomai.heardle.volume";
const DEFAULT = 0.7;

/**
 * Map the linear 0..1 slider position to an amplitude curve that feels
 * roughly perceptually uniform. Hearing is logarithmic, so a linear slider
 * leaves most of the audible range bunched into the bottom 10%. A squared
 * mapping (amplitude = pos²) is the standard fix used by most consumer
 * audio UIs — 50% slider → ~25% amplitude → ~−12 dB, which lines up with
 * what users expect "half volume" to sound like.
 */
export function volumeToAmplitude(pos: number): number {
  return pos * pos;
}

/**
 * Persisted audio volume in [0, 1]. SSR-safe: starts at DEFAULT, rehydrates
 * from localStorage after mount. Writes are persisted on every change.
 *
 * A module-level listener set lets multiple components stay in sync without
 * going through React context — important because the audio cards and the
 * reveal button mount/unmount independently as the deck advances.
 */
const listeners = new Set<(v: number) => void>();
let current = DEFAULT;
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const raw = window.localStorage.getItem(KEY);
  const parsed = raw == null ? NaN : Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    current = parsed;
  }
}

export function useVolume(): [number, (v: number) => void] {
  const [v, setV] = useState(current);
  useEffect(() => {
    hydrate();
    setV(current);
    const fn = (next: number) => setV(next);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const setVolume = (next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    current = clamped;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, String(clamped));
    }
    for (const l of listeners) l(clamped);
  };

  return [v, setVolume];
}
