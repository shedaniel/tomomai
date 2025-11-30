import { Difficulty } from "./types";

const ACHIEVEMENTS = [
  { achievement: 1005000, rate: "SSS+" },
  { achievement: 1000000, rate: "SSS" },
  { achievement: 995000, rate: "SS+" },
  { achievement: 990000, rate: "SS" },
  { achievement: 980000, rate: "S+" },
  { achievement: 970000, rate: "S" },
  { achievement: 940000, rate: "AAA" },
  { achievement: 900000, rate: "AA" },
  { achievement: 800000, rate: "A" },
  { achievement: 750000, rate: "BBB" },
  { achievement: 700000, rate: "BB" },
  { achievement: 600000, rate: "B" },
  { achievement: 500000, rate: "C" },
  { achievement: 0, rate: "D" },
]

function getAchievementRate(achievement: number): string {
  return ACHIEVEMENTS.find(a => achievement >= a.achievement)?.rate ?? "D";
}

const DIFFICULTY_COLORS: Record<Difficulty, { bg: string; text: string; border: string }> = {
  basic: { bg: "bg-emerald-500", text: "text-emerald-600", border: "border-emerald-500" },
  advanced: { bg: "bg-amber-500", text: "text-amber-600", border: "border-amber-500" },
  expert: { bg: "bg-rose-500", text: "text-rose-600", border: "border-rose-500" },
  master: { bg: "bg-violet-500", text: "text-violet-600", border: "border-violet-500" },
  remaster: { bg: "bg-violet-300", text: "text-violet-500", border: "border-violet-300" },
  utage: { bg: "bg-pink-500", text: "text-pink-600", border: "border-pink-500" },
};

export {
  ACHIEVEMENTS,
  getAchievementRate,
  DIFFICULTY_COLORS,
}