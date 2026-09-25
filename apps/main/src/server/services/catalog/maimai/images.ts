const MAIMAI_COVER_PATTERN = /^https?:\/\/(?:maimaidx\.jp|maimaidx(?:-eng)?\.com)\/maimai-mobile\/img\/Music\/(.+)$/;
// Lxns CN jacket: https://assets2.lxns.net/maimai/jacket/{id}.png — namespace under
// `lxns_{id}` to avoid collisions with the JP/INTL md5-style filenames.
const LXNS_COVER_PATTERN = /^https?:\/\/assets2?\.lxns\.net\/maimai\/jacket\/(\d+)\.png$/;

export const MAIMAI_STATIC_ASSETS: { url: string; basename: string }[] = [
  { url: "https://maimaidx.jp/maimai-mobile/img/music_dx.png", basename: "music_dx" },
  { url: "https://maimaidx.jp/maimai-mobile/img/music_standard.png", basename: "music_standard" },
];

// Returns a stable "filename" key for a cover URL (used for de-dup and R2 lookup).
// Returns null for URLs we don't know how to cache.
export function extractFilename(url: string): string | null {
  const maimai = url.match(MAIMAI_COVER_PATTERN);
  if (maimai) return maimai[1];
  const lxns = url.match(LXNS_COVER_PATTERN);
  if (lxns) return `lxns_${lxns[1]}.png`;
  return null;
}

export function isJpDomain(url: string): boolean {
  return url.includes("maimaidx.com/");
}

