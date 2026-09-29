import type { GradeRow } from "../types";

export const MAIMAI_GRADES: readonly GradeRow[] = [
  { min: 1_005_000, label: "SSS+", benchmark: true },
  { min: 1_000_000, label: "SSS", benchmark: true },
  { min: 995_000, label: "SS+", benchmark: true },
  { min: 990_000, label: "SS", benchmark: true },
  { min: 980_000, label: "S+", benchmark: true },
  { min: 970_000, label: "S", benchmark: true },
  { min: 940_000, label: "AAA", benchmark: true },
  { min: 900_000, label: "AA", benchmark: true },
  { min: 800_000, label: "A", benchmark: true },
  { min: 750_000, label: "BBB", benchmark: true },
  { min: 700_000, label: "BB", benchmark: true },
  { min: 600_000, label: "B", benchmark: true },
  { min: 500_000, label: "C", benchmark: true },
  { min: 0, label: "D", benchmark: true },
];
