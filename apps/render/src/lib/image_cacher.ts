/**
 * On-disk gzip cache for maimaidx.jp images (which have SSL issues and are
 * slow to fetch). Render is a long-lived process, so the filesystem cache
 * persists across requests.
 *
 * Stripped from the apps/main copy: `isServer()` is always true and
 * `isServerless()` always false here (long-lived Node process, not Vercel),
 * so those guards are removed.
 */

import { createHash } from 'crypto';
import { SAFE_MAIMAI_IMAGE_URLS } from './utils';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from "./logger";
import { PUBLIC_DIR } from "./paths";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

function generateUrlHash(url: string): string {
  return createHash('md5').update(url).digest('hex');
}

function isMaimaidxDomain(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return SAFE_MAIMAI_IMAGE_URLS.some(domain => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
}

export async function cacheImage(url: string): Promise<void> {
  if (!isMaimaidxDomain(url)) return;

  try {
    const urlHash = generateUrlHash(url);
    const cacheDir: string = path.join(PUBLIC_DIR, 'res', 'preloaded');
    await fs.mkdir(cacheDir, { recursive: true });

    const filePath = path.join(cacheDir, `${urlHash}.gz`);
    try {
      await fs.access(filePath);
      return;
    } catch {
    }

    const { Agent } = await import('undici');
    const httpsAgent = new Agent({
      connect: { rejectUnauthorized: false },
    });

    const response = await fetch(url, {
      // @ts-ignore - dispatcher property exists but TypeScript doesn't recognize it
      dispatcher: httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const compressedBuffer = await gzipAsync(buffer);
    await fs.writeFile(path.join(cacheDir, `${urlHash}.gz`), compressedBuffer);
  } catch (error) {
    logger.error({ err: error, url }, "Error caching image");
  }
}

export async function getCachedImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!isMaimaidxDomain(url)) return null;

  try {
    const urlHash = generateUrlHash(url);
    const cacheDir = path.join(PUBLIC_DIR, 'res', 'preloaded');
    const cachedFilePath = path.join(cacheDir, `${urlHash}.gz`);
    try {
      const compressedBuffer = await fs.readFile(cachedFilePath);
      const buffer = await gunzipAsync(compressedBuffer);

      let contentType = 'image/png';
      if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
        contentType = 'image/jpeg';
      } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        contentType = 'image/gif';
      } else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
        contentType = 'image/webp';
      } else if (buffer[0] === 0x3C && buffer[1] === 0x3F && buffer[2] === 0x78 && buffer[3] === 0x6D) {
        contentType = 'image/svg+xml';
      } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        contentType = 'image/png';
      }

      return { buffer, contentType };
    } catch {
    }
    return null;
  } catch (error) {
    logger.error({ err: error, url }, "Error reading cached image");
    return null;
  }
}
