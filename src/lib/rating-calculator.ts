import { SongWithScore } from "./types";

// Minimal interface for rating calculation - only requires the fields actually used
export interface RatingCalculationInput {
  achievement: number;
  fc: "none" | "fc" | "fc+" | "ap" | "ap+";
  levelPrecise: number;
  addedVersion: number;
}

// Type alias for backward compatibility - SongWithScore with rating added
export type SongWithRating = SongWithScore & { rating: number };

// Calculate rating factor based on accuracy
export function getRatingFactor(accuracy: number): number {
  if (accuracy >= 100.5) return 0.224;
  if (accuracy >= 100) return 0.216;
  if (accuracy >= 99.5) return 0.211;
  if (accuracy >= 99) return 0.208;
  if (accuracy >= 98) return 0.203;
  if (accuracy >= 97) return 0.2;
  if (accuracy >= 94) return 0.168;
  if (accuracy >= 90) return 0.152;
  if (accuracy >= 80) return 0.136;
  if (accuracy >= 75) return 0.12;
  if (accuracy >= 70) return 0.112;
  if (accuracy >= 60) return 0.096;
  if (accuracy >= 50) return 0.08;
  return 0.05;
}

// Calculate song rating using the formula: rating = floor(factor * accuracy * levelPrecise / 10)
export function calculateSongRating<T extends RatingCalculationInput>(song: T, version: number): number {
  const accuracy = song.achievement / 10000;
  const factor = getRatingFactor(accuracy);
  // Since version 12, AP/AP+ songs get an extra 1 rating
  const extra = version >= 12 && (song.fc === "ap" || song.fc === "ap+") ? 1 : 0;
  return factor * Math.min(accuracy, 100.5) * song.levelPrecise / 10 + extra;
}

// Helper function to add ratings to songs and sort by rating
export function addRatingsAndSort<T extends RatingCalculationInput>(songs: T[], version: number): (T & { rating: number })[] {
  return songs
    .map(song => ({
      ...song,
      rating: calculateSongRating(song, version)
    }))
    .sort((a, b) => b.achievement - a.achievement)
    .sort((a, b) => b.rating - a.rating)
    .map(song => ({
      ...song,
      rating: Math.floor(song.rating)
    }));
}

export function splitSongs<T extends RatingCalculationInput>(withScore: T[], version: number) {
  const songs = addRatingsAndSort(withScore, version);
  // Since version 12, we incorporate songs from the previous version into the new version
  const versionAboveIsNew = version >= 12 ? version - 1 : version;
  const newSongs = songs.filter(song => song.addedVersion >= versionAboveIsNew);
  const oldSongs = songs.filter(song => song.addedVersion < versionAboveIsNew);

  const newSongsB15 = newSongs.slice(0, 15);
  const oldSongsB35 = oldSongs.slice(0, 35);
  const newSongsRemaining = newSongs.slice(15);
  const oldSongsRemaining = oldSongs.slice(35);

  return {
    newSongsB15,
    oldSongsB35,
    newSongsRemaining,
    oldSongsRemaining,
  }
}

export function getRatingImageUrl(rating: number) {
  const variant = rating >= 15000 ? "rainbow"
    : rating >= 14500 ? "platinum"
      : rating >= 14000 ? "gold"
        : rating >= 13000 ? "silver"
          : rating >= 12000 ? "bronze"
            : rating >= 10000 ? "purple"
              : rating >= 7000 ? "red"
                : rating >= 4000 ? "yellow"
                  : rating >= 2000 ? "green"
                    : rating >= 1 ? "blue"
                      : "white";

  return `https://maimaidx.jp/maimai-mobile/img/rating_base_${variant}.png?ver=1.55`;
}
