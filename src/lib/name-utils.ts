import { Difficulty } from "./types";

export function normalizeName(text: string) {
  return text.normalize("NFKC").trim();
}

export function normalizeGenre(genre: string) {
  if (genre === "POPS＆ANIME") return "POPS＆アニメ"
  if (genre === "niconico＆VOCALOID™") return "niconico＆ボーカロイド"
  if (genre === "GAME＆VARIETY") return "ゲーム＆バラエティ"
  return genre;
}

export function renderLevelPrecise(levelPrecise: number, difficulty: Difficulty) {
  if (difficulty === "utage") return Math.floor(levelPrecise / 10) + ".?";
  return (levelPrecise / 10).toFixed(1);
}
