export function normalizeGenre(genre: string) {
  if (genre === "POPS＆ANIME") return "POPS＆アニメ"
  if (genre === "niconico＆VOCALOID™") return "niconico＆ボーカロイド"
  if (genre === "GAME＆VARIETY") return "ゲーム＆バラエティ"
  if (genre === "POPSアニメ") return "POPS＆アニメ"
  if (genre === "niconicoボーカロイド") return "niconico＆ボーカロイド"
  if (genre === "オンゲキCHUNITHM") return "オンゲキ＆CHUNITHM"
  if (genre === "ゲームバラエティ") return "ゲーム＆バラエティ"
  return genre;
}
