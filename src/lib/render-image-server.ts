import { getCachedImageBuffer } from "./image_cacher";
import { FontLibrary } from 'skia-canvas';
import path from 'path';
import { Agent } from 'undici';

const sharedFetchAgent = new Agent({
  connect: { timeout: 30_000 },
  connections: 16,
  pipelining: 1,
});

// In-memory cache for fetched images
const imageCache = new Map<string, { data: string; timestamp: number }>();
const MAX_CACHE_SIZE = 500; // Maximum number of cached images
const CACHE_TTL = 1000 * 60 * 60; // 1 hour TTL

// Clean up old cache entries
function cleanupCache() {
  if (imageCache.size <= MAX_CACHE_SIZE) return;

  const now = Date.now();
  const entries = Array.from(imageCache.entries());

  // Remove expired entries first
  for (const [key, value] of entries) {
    if (now - value.timestamp > CACHE_TTL) {
      imageCache.delete(key);
    }
  }

  // If still over limit, remove oldest entries
  if (imageCache.size > MAX_CACHE_SIZE) {
    const sorted = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = sorted.slice(0, imageCache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      imageCache.delete(key);
    }
  }
}

// Load fonts once at module initialization
export const fontsLoaded = (async () => {
  const startTime = Date.now();
  try {
    const fontsDir = path.join(process.cwd(), 'public', 'res', 'fonts');

    FontLibrary.use('FOT-NewRodin Pro', [path.join(fontsDir, 'FOT-NewRodin Pro EB.woff2')]);
    FontLibrary.use('Inter', [path.join(fontsDir, 'Inter-VariableFont_opsz,wght.woff2')]);
    FontLibrary.use('Murecho', [path.join(fontsDir, 'Murecho-VariableFont_wght.woff2')]);
    FontLibrary.use('Noto Sans JP', [path.join(fontsDir, 'NotoSansJP-VariableFont_wght.woff2')]);
    FontLibrary.use('Geist Mono', [path.join(fontsDir, 'GeistMono-VariableFont_wght.woff2')]);

    console.log(`✅ Fonts loaded successfully in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('❌ Failed to load fonts:', error);
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
    console.error('Error loading image for server-side rendering:', error);
    throw error;
  }
}
