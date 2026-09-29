import type { GamePresentation } from "../types";
import { MAIMAI_GRADES } from "./grades";

// Compact precision floors, so 99.9956% never reads as 100.00%.
function hundredths(scoreValue: number): number {
  return Math.floor(scoreValue / 100);
}

export const maimaiPresentation = {
  formatScore: (value, precision) => precision === "full"
    ? `${(value / 10_000).toFixed(4)}%`
    : `${(hundredths(value) / 100).toFixed(2)}%`,
  formatScoreDelta: (from, to) => `${((hundredths(to) - hundredths(from)) / 100).toFixed(2)}%`,
  scoreLabel: "achievement",
  ratingRules: { scale: 1, aggregation: "sum", axisStep: 100, filterBucketWidth: 10 },
  difficulties: {
    basic: {
      label: "BASIC",
      shortLabel: "BAS",
      hex: "#10b981",
      cssVar: "var(--color-green-400)",
      classes: {
        text: "text-emerald-600",
        cell: "bg-green-100 text-green-800 border-green-200 dark:bg-green-600/30 dark:text-green-400 dark:border-green-800",
        solidBg: "bg-emerald-500",
        border: "border-emerald-500",
        ring: "ring-green-400 dark:ring-green-600",
        badge: "bg-green-400 text-white",
        cardBadge: "bg-green-500 dark:bg-green-600 text-white",
      },
    },
    advanced: {
      label: "ADVANCED",
      shortLabel: "ADV",
      hex: "#f59e0b",
      cssVar: "var(--color-yellow-400)",
      classes: {
        text: "text-amber-600",
        cell: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-600/30 dark:text-yellow-400 dark:border-yellow-800",
        solidBg: "bg-amber-500",
        border: "border-amber-500",
        ring: "ring-yellow-400 dark:ring-yellow-600",
        badge: "bg-yellow-400 text-white",
        cardBadge: "bg-yellow-500 dark:bg-yellow-600 text-white",
      },
    },
    expert: {
      label: "EXPERT",
      shortLabel: "EXP",
      hex: "#f43f5e",
      cssVar: "var(--color-red-400)",
      classes: {
        text: "text-rose-600",
        cell: "bg-red-100 text-red-800 border-red-200 dark:bg-red-600/30 dark:text-red-400 dark:border-red-800",
        solidBg: "bg-rose-500",
        border: "border-rose-500",
        ring: "ring-red-400 dark:ring-red-600",
        badge: "bg-red-400 text-white",
        cardBadge: "bg-red-500 dark:bg-red-600 text-white",
      },
    },
    master: {
      label: "MASTER",
      shortLabel: "MAS",
      hex: "#8b5cf6",
      cssVar: "var(--color-purple-500)",
      classes: {
        text: "text-violet-600",
        cell: "bg-purple-300 text-purple-900 border-purple-400 dark:bg-purple-600/30 dark:text-purple-400 dark:border-purple-800",
        solidBg: "bg-violet-500",
        border: "border-violet-500",
        ring: "ring-purple-500 dark:ring-purple-600",
        badge: "bg-purple-500 text-white",
        cardBadge: "bg-purple-500 dark:bg-purple-600 text-white",
      },
    },
    remaster: {
      label: "Re:MASTER",
      shortLabel: "ReM",
      hex: "#d8b4fe",
      cssVar: "var(--color-purple-200)",
      classes: {
        text: "text-violet-500",
        cell: "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-50/80 dark:border-purple-300",
        solidBg: "bg-violet-300",
        border: "border-violet-300",
        ring: "ring-purple-200 dark:ring-purple-400",
        badge: "bg-purple-200 text-purple-900",
        cardBadge: "bg-purple-200 text-purple-900 dark:bg-purple-400 dark:text-purple-900",
      },
    },
    utage: {
      label: "UTAGE",
      shortLabel: "宴",
      unknownDecimal: true,
      hex: "#ec4899",
      cssVar: "var(--color-pink-400)",
      classes: {
        text: "text-pink-600",
        cell: "bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-600/30 dark:text-pink-400 dark:border-pink-800",
        solidBg: "bg-pink-500",
        border: "border-pink-500",
        ring: "ring-pink-400 dark:ring-pink-600",
        badge: "bg-pink-400 text-white",
        cardBadge: "bg-pink-500 dark:bg-pink-600 text-white",
      },
    },
  },
  chartTypes: {
    std: {
      label: "STD",
      ogLabel: "スタンダード",
      badgePath: "covers/music_standard.webp",
      hex: "#06b6d4",
      classes: { ring: "ring-slate-300 dark:ring-slate-300/75", chip: "bg-slate-100 text-slate-600" },
    },
    dx: {
      label: "DX",
      ogLabel: "でらっくす",
      badgePath: "covers/music_dx.webp",
      hex: "#f59e0b",
      classes: { ring: "ring-amber-400 dark:ring-amber-300/75", chip: "bg-amber-100 text-amber-700" },
    },
  },
  statusStyles: {
    comboStatus: {
      none: null,
      fc: { label: "FC", className: "bg-emerald-500" },
      "fc+": { label: "FC+", className: "bg-gradient-to-r from-emerald-400 to-teal-500" },
      ap: { label: "AP", className: "bg-pink-500" },
      "ap+": { label: "AP+", className: "bg-gradient-to-r from-orange-400 to-pink-500" },
    },
    syncStatus: {
      none: null,
      sync: { label: "SYNC", className: "bg-slate-500" },
      fs: { label: "FS", className: "bg-blue-500" },
      "fs+": { label: "FS+", className: "bg-gradient-to-r from-blue-400 to-indigo-500" },
      fdx: { label: "FDX", className: "bg-orange-500" },
      "fdx+": { label: "FDX+", className: "bg-gradient-to-r from-orange-400 to-amber-500" },
    },
    clearStatus: { none: null },
  },
  statusColumns: [
    { labelKey: "fc", kinds: ["comboStatus"] },
    { labelKey: "fs", kinds: ["syncStatus"] },
  ],
  grades: MAIMAI_GRADES,
} satisfies GamePresentation<"maimai">;
