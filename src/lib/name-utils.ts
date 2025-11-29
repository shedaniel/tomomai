export function normalizeName(text: string) {
  return text.normalize("NFKC").trim();
}

export function normalizeGenre(genre: string) {
  if (genre === "POPS＆ANIME") return "POPS＆アニメ"
  if (genre === "niconico＆VOCALOID™") return "niconico＆ボーカロイド"
  return genre;
}