"use client";

import { useSyncExternalStore } from "react";
import { findNetEgg } from "../eggs/eggs";

/** The fake course a visitor "bought". Kept only in this browser, and nothing is ever charged. */
export const NET_TIERS = ["free", "standard", "premium"] as const;
export type NetTier = (typeof NET_TIERS)[number];
export type NetPaidTier = Exclude<NetTier, "free">;

const TIER_KEY = "tomomai-net-tier";
const DARK_KEY = "tomomai-net-dark";
const CHANGE_EVENT = "tomomai-net-change";
const CELEBRATE_EVENT = "tomomai-net-celebrate";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked. The purchase then lasts until the next page load, which is also fine.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readTier(): NetTier {
  const stored = read(TIER_KEY);
  return NET_TIERS.find(tier => tier === stored) ?? "free";
}

export function useNetTier(): NetTier {
  return useSyncExternalStore(subscribe, readTier, () => "free");
}

export function useNetDarkMode(): boolean {
  return useSyncExternalStore(subscribe, () => read(DARK_KEY) === "1", () => false);
}

export function setNetDarkMode(on: boolean) {
  write(DARK_KEY, on ? "1" : null);
  if (on && readTier() === "premium") findNetEgg("invertedDark");
}

/** "Buys" a course: stores it and throws the confetti. */
export function purchaseNetTier(tier: NetPaidTier) {
  write(TIER_KEY, tier);
  window.dispatchEvent(new CustomEvent<NetPaidTier>(CELEBRATE_EVENT, { detail: tier }));
}

export function cancelNetTier() {
  write(TIER_KEY, null);
  write(DARK_KEY, null);
}

export function onNetCelebrate(listener: (tier: NetPaidTier) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<NetPaidTier>).detail);
  window.addEventListener(CELEBRATE_EVENT, handler);
  return () => window.removeEventListener(CELEBRATE_EVENT, handler);
}

export function readSessionFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeSessionFlag(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Without session storage the nudge just comes back on the next visit.
  }
}
