import type { SongType } from "@/lib/games/maimai/types";

// Detects "dx" / "std" from a maimai music_kind_icon `src` attribute.
// Returns null if the icon is missing or unrecognized.
export function musicTypeFromIcon(iconSrc: string | undefined): SongType | null {
  if (!iconSrc) return null;
  if (iconSrc.includes("music_dx.png")) return "dx";
  if (iconSrc.includes("music_standard.png")) return "std";
  return null;
}

// maimai NET answers an expired session with HTTP 200 and its error page.
export function assertMaimaiPage(html: string): void {
  if (html.includes("ERROR CODE：100001") || html.includes("Please login again")) {
    throw new Error("Session expired or invalid. Please provide a new token.");
  }
}
