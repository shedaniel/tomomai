import { clsx, type ClassValue } from "clsx";

export const SAFE_MAIMAI_IMAGE_URLS = [
  'maimaidx.jp',
  'maimaidx-eng.com',
  'cdn.gamerch.com',
  'maimai.sega.jp',
]

import { twMerge } from "tailwind-merge";

export { getLanguages } from "@tomomai/i18n/languages";

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

export function sortKeys<T>(obj: T): T {
  return Object.fromEntries(Object.entries(obj as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) as unknown as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deeply merges two objects. Properties in `source` will overwrite properties in `target`.
 * If a property is an object in both, it will be merged recursively.
 *
 * @param target The object to merge into.
 * @param source The object to merge from.
 * @returns A new object with the merged properties.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key]) && isObject(output[key])) {
        // If both target and source have an object for this key, merge recursively
        output[key as keyof T] = deepMerge(output[key] as Record<string, unknown>, source[key] as Record<string, unknown>) as T[keyof T];
      } else {
        // Otherwise, simply assign the source value (overwriting if it exists)
        Object.assign(output, { [key]: source[key] });
      }
    });
  }

  return output;
}

// Helper function to detect if we're on the server
export function isServer(): boolean {
  return typeof window === 'undefined';
}

// Helper function to detect serverless environment
export function isServerless(): boolean {
  return process.env.VERCEL === '1' ||
    process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined ||
    process.env.NETLIFY === 'true' ||
    process.cwd() === '/var/task';
}

export async function awaitWrapper<T>(promise: Promise<T>): Promise<[T | null, Error | null]> {
  return promise
    .then(data => [data, null] as [T, null])
    .catch(error => [null, error as Error] as [null, Error]);
}

export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export const levenshtein = (a: string, b: string): number => {
  const tmp = [];
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  for (let i = 0; i <= b.length; i++) tmp[i] = [i];
  for (let j = 0; j <= a.length; j++) tmp[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      tmp[i][j] = (b[i - 1] === a[j - 1])
        ? tmp[i - 1][j - 1]
        : Math.min(tmp[i - 1][j - 1] + 1, Math.min(tmp[i][j - 1] + 1, tmp[i - 1][j] + 1));
    }
  }
  return tmp[b.length][a.length];
};

export function maxBy<T>(array: T[], iteratee: (item: T) => number): T | undefined {
  if (array.length === 0) return undefined;
  let maxItem = array[0];
  let maxValue = iteratee(maxItem);
  for (let i = 1; i < array.length; i++) {
    const value = iteratee(array[i]);
    if (value > maxValue) {
      maxValue = value;
      maxItem = array[i];
    }
  }
  return maxItem;
}
