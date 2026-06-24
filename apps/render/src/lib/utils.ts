// @copied-from apps/main/src/lib/utils.ts — temporary duplicate; do not edit manually, change apps/main and re-sync (extracted to a shared package in the catalogue PR).

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export {
  levenshtein,
  sortKeys,
  deepMerge,
  isServer,
  isServerless,
  awaitWrapper,
  isNullOrUndefined,
  maxBy,
} from "@tomomai/utils";
export { getLanguages } from "@tomomai/i18n/languages";

export const SAFE_MAIMAI_IMAGE_URLS = [
  'maimaidx.jp',
  'maimaidx-eng.com',
  'cdn.gamerch.com',
  'maimai.sega.jp',
]

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// R2 CDN URLs are pre-optimized WebP — skip Next.js image optimization for them
export function isR2Url(url: string): boolean {
  const r2Base = process.env.NEXT_PUBLIC_R2_URL;
  const r2BaseCN = process.env.NEXT_PUBLIC_R2_URL_CN;
  return (!!r2Base && url.startsWith(r2Base)) || (!!r2BaseCN && url.startsWith(r2BaseCN));
}

// Reads `country` cookie (set by middleware from x-vercel-ip-country).
// Returns null on the server or when the cookie is absent.
function getCountryFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)country=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// For users in China (detected via Vercel edge geo header → cookie), rewrite
// R2 URLs to the CN-specific CDN base so image fetches don't have to traverse
// the GFW. No-op on the server, when the cookie isn't set, or when the URL
// isn't on the default R2 base.
function maybeRewriteR2ForCN(url: string): string {
  const base = process.env.NEXT_PUBLIC_R2_URL;
  const cnBase = process.env.NEXT_PUBLIC_R2_URL_CN;
  if (!base || !cnBase || !url.startsWith(base)) return url;
  if (getCountryFromCookie() !== 'CN') return url;
  return cnBase + url.slice(base.length);
}

export function getTypeBadgeUrl(type: "dx" | "std" | string): string {
  const basename = type === "dx" ? "music_dx" : "music_standard";
  return `${process.env.NEXT_PUBLIC_R2_URL}/covers/${basename}.webp`;
}

export function getLogoUrl(gameVersion: number, region: "intl" | "jp" | "cn"): string {
  return `/res/logo/${gameVersion}${region === "cn" ? "_cn" : ""}.png`;
}

// Utility function to handle maimaidx image URLs with SSL issues
// Sync version for client-side React components
export function createSafeMaimaiImageUrl(originalUrl: string): string {
  // Check if it's a maimaidx domain
  if (SAFE_MAIMAI_IMAGE_URLS.some(domain => originalUrl.includes(domain))) {
    // On client side, always use proxy (cache check would require server-side APIs)
    const encodedUrl = encodeURIComponent(originalUrl);
    return `/api/image-proxy?url=${encodedUrl}`;
  }

  // For R2-hosted assets, swap to the CN CDN base when the user is in China.
  return maybeRewriteR2ForCN(originalUrl);
}
