/**
 * Minimal utils for the render service. The apps/main copy re-exported
 * @tomomai/utils, @tomomai/i18n, clsx, tailwind-merge and several browser-only
 * helpers — none of which render uses. Stripped to just the two URL helpers
 * and the maimaidx domain list.
 */

export const SAFE_MAIMAI_IMAGE_URLS = [
  'maimaidx.jp',
  'maimaidx-eng.com',
  'cdn.gamerch.com',
  'maimai.sega.jp',
];

const R2_BASE = process.env.NEXT_PUBLIC_R2_URL ?? "";

export function getTypeBadgeUrl(type: "dx" | "std" | string): string {
  const basename = type === "dx" ? "music_dx" : "music_standard";
  return `${R2_BASE}/covers/${basename}.webp`;
}

export function getLogoUrl(gameVersion: number, region: "intl" | "jp" | "cn"): string {
  return `/res/logo/${gameVersion}${region === "cn" ? "_cn" : ""}.png`;
}
