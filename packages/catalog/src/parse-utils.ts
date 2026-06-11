import { SongType } from "./types";

// Detects "dx" / "std" from a maimai music_kind_icon `src` attribute.
// Returns null if the icon is missing or unrecognized.
export function musicTypeFromIcon(iconSrc: string | undefined): SongType | null {
  if (!iconSrc) return null;
  if (iconSrc.includes("music_dx.png")) return "dx";
  if (iconSrc.includes("music_standard.png")) return "std";
  return null;
}
