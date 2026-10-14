import type { GradeRow } from "../types";

export const CHUNITHM_GRADES: readonly GradeRow[] = [
  { min: 1_009_000, label: "SSS+", benchmark: true },
  { min: 1_007_500, label: "SSS", benchmark: true },
  { min: 1_005_000, label: "SS+", benchmark: true },
  { min: 1_000_000, label: "SS", benchmark: true },
  { min: 990_000, label: "S+", benchmark: true },
  { min: 975_000, label: "S", benchmark: true },
  { min: 950_000, label: "AAA", benchmark: true },
  { min: 925_000, label: "AA", benchmark: true },
  { min: 900_000, label: "A", benchmark: true },
  { min: 800_000, label: "BBB" },
  { min: 700_000, label: "BB" },
  { min: 600_000, label: "B" },
  { min: 500_000, label: "C" },
  { min: 0, label: "D" },
];
