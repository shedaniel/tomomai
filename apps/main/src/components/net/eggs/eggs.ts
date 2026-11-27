"use client";

import { useSyncExternalStore } from "react";

/**
 * Every hidden secret on tomomai NET, grouped by how hard it is to find. BASIC hints spell the trigger out, MASTER
 * hints barely hint. Found ones are kept in this browser. Names and hints live in messages/net/en/eggs.json.
 */
export const NET_EGG_LEVELS = {
  basic: [
    "welcome", "topAtTop", "copyright", "typeLogin", "friendNobody", "serialTomomai", "invertedDark", "aprilFoolsBypass", "grandTour",
  ],
  advanced: [
    "logo", "gear", "slide", "ferris", "phpWarning", "aiPoke", "typeAime", "optionsMute", "favoritesSpam", "friendSelf", "notFound", "circleEscape", "logoutSpam",
  ],
  expert: [
    "teapot", "stickyButton3", "friendError", "shopCancelFree", "nudgeDecline", "danRetry", "konami", "console", "tabAway", "idle", "optionsMaxed", "optionsSpin", "titlePersistent",
  ],
  master: [
    "friendMirror", "serialUtage", "admin", "credits", "doubleSlide", "buttonSpin", "printReceipt", "fakeUrgency", "everyTab", "maintenance", "aprilFools",
  ],
} as const;
export type NetEggLevel = keyof typeof NET_EGG_LEVELS;

export const NET_EGGS = Object.values(NET_EGG_LEVELS).flat();
export type NetCountedEggId = (typeof NET_EGG_LEVELS)[NetEggLevel][number];

/** Secrets that are not on the list and not in the total. They only show up once found. */
export const NET_HIDDEN_EGGS = ["hasunosora", "gakumas"] as const;
export type NetHiddenEggId = (typeof NET_HIDDEN_EGGS)[number];
export type NetEggId = NetCountedEggId | NetHiddenEggId;

const KNOWN_EGGS: readonly string[] = [...NET_EGGS, ...NET_HIDDEN_EGGS];

const EGGS_KEY = "tomomai-net-eggs";
const CHANGE_EVENT = "tomomai-net-eggs-change";
const FOUND_EVENT = "tomomai-net-egg-found";

let memory: NetEggId[] = [];
let cachedRaw: string | null | undefined;
let cachedList: readonly NetEggId[] = [];
let cachedCounted: readonly NetCountedEggId[] = [];
let cachedHidden: readonly NetHiddenEggId[] = [];

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(EGGS_KEY);
  } catch {
    return memory.join(",");
  }
}

function readAll(): readonly NetEggId[] {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  cachedList = (raw ?? "").split(",").filter((id): id is NetEggId => KNOWN_EGGS.includes(id));
  cachedCounted = cachedList.filter((id): id is NetCountedEggId => (NET_EGGS as readonly string[]).includes(id));
  cachedHidden = cachedList.filter((id): id is NetHiddenEggId => (NET_HIDDEN_EGGS as readonly string[]).includes(id));
  return cachedList;
}

function readCounted(): readonly NetCountedEggId[] {
  readAll();
  return cachedCounted;
}

function readHidden(): readonly NetHiddenEggId[] {
  readAll();
  return cachedHidden;
}

const EMPTY: readonly never[] = [];

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const OPEN_EVENT = "tomomai-net-secrets-open";

export function openNetSecrets() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onNetSecretsOpen(listener: () => void) {
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}

/** The found secrets that count toward the total. */
export function useNetEggs(): readonly NetCountedEggId[] {
  return useSyncExternalStore(subscribe, readCounted, () => EMPTY);
}

export function useNetHiddenEggs(): readonly NetHiddenEggId[] {
  return useSyncExternalStore(subscribe, readHidden, () => EMPTY);
}

/** Marks a secret as found and announces it. Finding it again does nothing. */
export function findNetEgg(id: NetEggId) {
  const found = readAll();
  if (found.includes(id)) return;
  const next = [...found, id];
  memory = next;
  try {
    window.localStorage.setItem(EGGS_KEY, next.join(","));
  } catch {
    // Without storage the secret counts until the next page load.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  window.dispatchEvent(new CustomEvent<NetEggId>(FOUND_EVENT, { detail: id }));
}

export function forgetNetEggs() {
  memory = [];
  try {
    window.localStorage.removeItem(EGGS_KEY);
  } catch {
    // Nothing stored, nothing to forget.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onNetEggFound(listener: (id: NetEggId) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<NetEggId>).detail);
  window.addEventListener(FOUND_EVENT, handler);
  return () => window.removeEventListener(FOUND_EVENT, handler);
}

/**
 * Calls `onMatch` when the visitor types `sequence` anywhere outside a text field. Keys are compared
 * case-insensitively by `KeyboardEvent.key`.
 */
export function listenForSequence(sequence: readonly string[], onMatch: () => void) {
  let position = 0;
  const handler = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    const key = event.key.toLowerCase();
    if (key === sequence[position].toLowerCase()) position++;
    else position = key === sequence[0].toLowerCase() ? 1 : 0;
    if (position === sequence.length) {
      position = 0;
      onMatch();
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
