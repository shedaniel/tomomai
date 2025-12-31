import { createHash } from 'crypto';
import { SAFE_MAIMAI_IMAGE_URLS, isServer, isServerless } from './utils';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from "@/lib/logger";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// Generate a hash for the URL to use as filename
function generateUrlHash(url: string): string {
  return createHash('md5').update(url).digest('hex');
}

// Check if URL is from allowed maimaidx domains
function isMaimaidxDomain(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return SAFE_MAIMAI_IMAGE_URLS.some(domain => urlObj.hostname.includes(domain))
  } catch {
    return false;
  }
}

// Cache and return local path for maimaidx images
export async function cacheImage(url: string): Promise<void> {
  // Only cache on server and for maimaidx domains
  if (!isServer() || !isMaimaidxDomain(url) || isServerless()) {
    return;
  }

  try {
    // Generate hash for filename
    const urlHash = generateUrlHash(url);

    // Use different cache directory based on environment
    const cacheDir: string = path.join(process.cwd(), 'public', 'res', 'preloaded');
    await fs.mkdir(cacheDir, { recursive: true });

    // Check if file already exists
    const filePath = path.join(cacheDir, `${urlHash}.gz`);
    try {
      await fs.access(filePath);
      return;
    } catch {
    }

    const { Agent } = await import('undici');
    const httpsAgent = new Agent({
      connect: {
        rejectUnauthorized: false
      }
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

    // Save to cache
    const cachedFilePath = path.join(cacheDir, `${urlHash}.gz`);

    const compressedBuffer = await gzipAsync(buffer);

    await fs.writeFile(cachedFilePath, compressedBuffer);
  } catch (error) {
    logger.error({ error, url }, "Error caching image");
  }
}

// Get cached image buffer for API routes
export async function getCachedImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!isServer() || !isMaimaidxDomain(url)) {
    return null;
  }

  // In serverless environments, no filesystem caching available
  if (isServerless()) {
    return null;
  }

  try {
    const urlHash = generateUrlHash(url);
    const cacheDir = path.join(process.cwd(), 'public', 'res', 'preloaded');

    // Check if gzipped cached file exists
    const cachedFilePath = path.join(cacheDir, `${urlHash}.gz`);
    try {
      const compressedBuffer = await fs.readFile(cachedFilePath);
      const buffer = await gunzipAsync(compressedBuffer);

      // Check magic bytes for image type
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
    logger.error({ error, url }, "Error reading cached image");
    return null;
  }
}
