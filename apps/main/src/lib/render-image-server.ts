import { getCachedImageBuffer } from "./image_cacher";
import { getLogger } from "./request-logger";
import { FontLibrary, Image, loadImage } from 'skia-canvas';
import path from 'path';
import { Agent } from 'undici';

const sharedFetchAgent = new Agent({
  connect: { timeout: 30_000, rejectUnauthorized: false },
  connections: 16,
  pipelining: 1,
});

// In-memory cache of fetched base64 data URLs (legacy, kept for fetchImageForServer
// callers that still need a data URL string).
const imageCache = new Map<string, { data: string; timestamp: number }>();
const MAX_CACHE_SIZE = 500;
const CACHE_TTL = 1000 * 60 * 60;

// Process-level cache of *decoded* skia Image objects, keyed by URL.
// Eliminates the per-request fetch + base64 + decode round-trip for any URL
// that's already been requested at least once since process start. Uses
// insertion-order eviction (Map preserves insertion order, on hit we
// delete+re-set to refresh LRU position).
const decodedImageCache = new Map<string, Image>();
const MAX_DECODED_CACHE_SIZE = 256;
// Inflight dedupe so concurrent first-time requests for the same URL share one fetch/decode.
const inflightDecodes = new Map<string, Promise<Image>>();

function touchDecodedCache(url: string, image: Image) {
  if (decodedImageCache.has(url)) decodedImageCache.delete(url);
  decodedImageCache.set(url, image);
  while (decodedImageCache.size > MAX_DECODED_CACHE_SIZE) {
    const oldest = decodedImageCache.keys().next().value;
    if (oldest === undefined) break;
    decodedImageCache.delete(oldest);
  }
}

function cleanupCache() {
  if (imageCache.size <= MAX_CACHE_SIZE) return;

  const now = Date.now();
  const entries = Array.from(imageCache.entries());

  for (const [key, value] of entries) {
    if (now - value.timestamp > CACHE_TTL) {
      imageCache.delete(key);
    }
  }

  if (imageCache.size > MAX_CACHE_SIZE) {
    const sorted = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = sorted.slice(0, imageCache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      imageCache.delete(key);
    }
  }
}

async function fetchBufferForServer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (url.includes('maimaidx.jp') || url.includes('maimaidx-eng.com')) {
    const cached = await getCachedImageBuffer(url);
    if (cached) {
      return { buffer: cached.buffer, contentType: cached.contentType };
    }
  }

  if (url.startsWith('/res')) {
    const fs = await import('fs/promises');
    const filePath = path.join(process.cwd(), 'public', url);
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(url).toLowerCase();
    const contentType = ext === '.png' ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
        : ext === '.gif' ? 'image/gif'
          : ext === '.webp' ? 'image/webp'
            : ext === '.svg' ? 'image/svg+xml'
              : 'image/png';
    return { buffer, contentType };
  }

  const response = await fetch(url, {
    // @ts-ignore - dispatcher exists on undici but not in lib.dom
    dispatcher: sharedFetchAgent,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType: response.headers.get('content-type') || 'image/png' };
}

/**
 * Returns a decoded skia `Image` for `url`, using a process-level LRU cache.
 * First call for a URL incurs fetch + decode; subsequent calls (anywhere in
 * the process) return the same Image instance — skia is fine with drawing
 * the same Image to many canvases.
 */
export async function loadCachedImage(url: string): Promise<Image> {
  const cached = decodedImageCache.get(url);
  if (cached) {
    // Refresh LRU position.
    decodedImageCache.delete(url);
    decodedImageCache.set(url, cached);
    return cached;
  }

  const inflight = inflightDecodes.get(url);
  if (inflight) return inflight;

  const promise = (async () => {
    const { buffer } = await fetchBufferForServer(url);
    const image = await loadImage(buffer);
    touchDecodedCache(url, image);
    return image;
  })();
  inflightDecodes.set(url, promise);
  try {
    return await promise;
  } finally {
    inflightDecodes.delete(url);
  }
}

// Load fonts once at module initialization
export const fontsLoaded = (async () => {
  const startTime = Date.now();
  try {
    const fontsDir = path.join(process.cwd(), 'public', 'res', 'fonts');

    FontLibrary.use('FOT-NewRodin Pro', [path.join(fontsDir, 'FOT-NewRodin Pro EB.woff2')]);
    FontLibrary.use('Inter', [path.join(fontsDir, 'Inter-VariableFont_opsz_wght.woff2')]);
    FontLibrary.use('Murecho', [path.join(fontsDir, 'Murecho-VariableFont_wght.woff2')]);
    FontLibrary.use('Noto Sans JP', [path.join(fontsDir, 'NotoSansJP-VariableFont_wght.woff2')]);
    FontLibrary.use('Geist Mono', [path.join(fontsDir, 'GeistMono-VariableFont_wght.woff2')]);

    getLogger().info({ durationMs: Date.now() - startTime }, 'Fonts loaded successfully');
  } catch (error) {
    getLogger().error({ err: error }, 'Failed to load fonts');
  }
})();

// Server-only function for fetching images with Node.js modules
export async function fetchImageForServer(url: string): Promise<string> {
  // Check in-memory cache first
  const cached = imageCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    let finalUrl = url;

    // For maimaidx URLs, use caching system
    if (url.includes('maimaidx.jp') || url.includes('maimaidx-eng.com')) {
      const cachedResult = await getCachedImageBuffer(url);
      if (cachedResult) {
        finalUrl = `data:${cachedResult.contentType};base64,${cachedResult.buffer.toString('base64')}`;
      }
    }

    let buffer: Buffer;
    let contentType: string;

    if (finalUrl.startsWith('/res')) {
      // Local file - read directly from filesystem
      const fs = await import('fs/promises');
      const path = await import('path');

      // Convert URL path to filesystem path (remove leading /, add public/)
      const filePath = path.join(process.cwd(), 'public', finalUrl);

      buffer = await fs.readFile(filePath);

      // Determine content type from file extension
      const ext = path.extname(finalUrl).toLowerCase();
      contentType = ext === '.png' ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
          : ext === '.gif' ? 'image/gif'
            : ext === '.webp' ? 'image/webp'
              : ext === '.svg' ? 'image/svg+xml'
                : 'image/png'; // default fallback
    } else {
      const response = await fetch(finalUrl, {
        // @ts-ignore - dispatcher property exists but TypeScript doesn't recognize it
        dispatcher: sharedFetchAgent,
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      contentType = response.headers.get('content-type') || 'image/png';
    }

    const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;

    // Store in cache
    imageCache.set(url, { data: dataUrl, timestamp: Date.now() });
    cleanupCache();

    return dataUrl;
  } catch (error) {
    getLogger().error({ err: error }, 'Error loading image for server-side rendering');
    throw error;
  }
}
