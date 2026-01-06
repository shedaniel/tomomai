import { getCachedImageBuffer } from "./image_cacher";
import { FontLibrary } from 'skia-canvas';
import path from 'path';

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
      const { Agent } = await import('undici');
      const httpsAgent = new Agent({
        connect: {
          rejectUnauthorized: false
        }
      });
      const response = await fetch(finalUrl, {
        // @ts-ignore - dispatcher property exists but TypeScript doesn't recognize it
        dispatcher: httpsAgent,
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      contentType = response.headers.get('content-type') || 'image/png';
    }

    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.error('Error loading image for server-side rendering:', error);
    throw error;
  }
}
