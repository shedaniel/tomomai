import { NextRequest, NextResponse } from 'next/server';
import { Agent } from 'undici';
import { getCachedImageBuffer, cacheImage } from '@/lib/image_cacher';
import { flushLogger } from '@/lib/logger';
import { requestLogger } from '@/lib/request-logger';
import { isSafeMaimaiImageUrl } from '@/lib/utils';

export async function GET(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "image-proxy");
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  // Only fetch exact HTTPS hosts from the cover-image allowlist.
  if (!isSafeMaimaiImageUrl(imageUrl)) {
    return new NextResponse('Unauthorized domain', { status: 403 });
  }

  try {
    // First, try to get cached image buffer
    const cachedResult = await getCachedImageBuffer(imageUrl);
    if (cachedResult) {
      return new NextResponse(new Uint8Array(cachedResult.buffer), {
        headers: {
          'Content-Type': cachedResult.contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // If not cached, cache it first (this will save to filesystem)
    await cacheImage(imageUrl);

    // Try to get the cached buffer again
    const newCachedResult = await getCachedImageBuffer(imageUrl);
    if (newCachedResult) {
      return new NextResponse(new Uint8Array(newCachedResult.buffer), {
        headers: {
          'Content-Type': newCachedResult.contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // Fallback: fetch directly if caching failed
    const httpsAgent = new Agent({
      connect: {
        rejectUnauthorized: false
      }
    });

    const response = await fetch(imageUrl, {
      // @ts-ignore - dispatcher property exists but TypeScript doesn't recognize it
      dispatcher: httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });

    if (!response.ok) {
      return new NextResponse(`Failed to fetch image: ${response.status}`, { status: response.status });
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

  } catch (error) {
    log.error({ err: error, url: imageUrl }, "Error proxying image");
    // Flush only on the error path — successful image serving is hot and must
    // not wait on a log flush.
    await flushLogger();
    return new NextResponse(`Internal server error (${requestId})`, { status: 500 });
  }
}
