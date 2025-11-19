import { clsx, type ClassValue } from "clsx";

export const SAFE_MAIMAI_IMAGE_URLS = [
  'maimaidx.jp',
  'maimaidx-eng.com',
  'cdn.gamerch.com',
  'maimai.sega.jp',
]

import { twMerge } from "tailwind-merge";

export const getLanguages = (t: (key: string) => string) => [
  { value: null, label: t('settings.language.auto'), code: "AUTO" },
  { value: "en", label: t('settings.language.en'), code: "US" },
  { value: "en-GB", label: t('settings.language.en-GB'), code: "UK" },
  { value: "ja", label: t('settings.language.ja'), code: "JA" },
  { value: "zh-TW", label: t('settings.language.zh-TW'), code: "TW" },
  { value: "zh-HK", label: t('settings.language.zh-HK'), code: "HK" },
  { value: "zh-CN", label: t('settings.language.zh-CN'), code: "CN" },
];

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
  
  // Return original URL for other domains
  return originalUrl;
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
export function deepMerge<T extends Record<string, any>>(
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
