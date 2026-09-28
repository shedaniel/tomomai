import { Difficulty } from "./types";

export function normalizeName(text: string) {
  return text.normalize("NFKC").trim();
}

export function renderLevelPrecise(levelPrecise: number, difficulty: Difficulty) {
  if (difficulty === "utage") return Math.floor(levelPrecise / 10) + ".?";
  return (levelPrecise / 10).toFixed(1);
}
