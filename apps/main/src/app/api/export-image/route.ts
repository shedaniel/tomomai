import { getRatingImageUrl, splitSongs } from '@/lib/rating-calculator';
import { ImageCache, renderImage, SongForRender } from '@/lib/render-image';
import { fetchImageForServer, fontsLoaded } from '@/lib/render-image-server';
import type { Region } from '@/lib/types';
import { NextRequest, NextResponse } from 'next/server';
import { Image, loadImage } from 'skia-canvas';
import { getLogoUrl, getTypeBadgeUrl } from '@/lib/utils';
import { prepareExportImageData } from '@/server/queries/export-image';
import { logger } from '@/lib/logger';
import { nanoid } from 'nanoid';

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = nanoid(10);
  const log = logger.child({
    route: "export-image",
    requestId,
  });

  log.info('🚀 Starting skia-canvas export-image API request');
  try {
    await fontsLoaded;

    const snapshotId = request.nextUrl.searchParams.get('snapshotId');
    const scaleParam = request.nextUrl.searchParams.get('scale');
    const scale = scaleParam === '1' ? 1 : 2; // Accept 1 or 2, default to 2
    const username = request.nextUrl.searchParams.get('username') ?? undefined;
    const region = (request.nextUrl.searchParams.get('region') ?? undefined) as Region | undefined;
    log.info({ snapshotId, scale }, '📋 Received snapshot ID');

    if (!snapshotId) {
      log.error('❌ No snapshot ID provided');
      return NextResponse.json({ error: 'Snapshot ID is required', requestId }, { status: 400 });
    }

    const prepareDataResult = await prepareExportImageData(snapshotId, username, region);
    if (prepareDataResult.type === "error") {
      return NextResponse.json({ error: prepareDataResult.error, requestId }, { status: 404 });
    }

    const { data, region: snapshotRegion, visitableProfileAt } = prepareDataResult;

    // Pre-cache images
    log.info('🖼️ Pre-caching images...');
    let startTime = Date.now();
    const { newSongsB15, oldSongsB35 } = splitSongs(data.songs, data.snapshot.gameVersion);

    const imagesToCache = [
      getTypeBadgeUrl("dx"),
      getTypeBadgeUrl("std"),
      getRatingImageUrl(data.snapshot.rating, data.snapshot.gameVersion),
      data.snapshot.iconUrl,
      data.snapshot.classRankUrl,
      data.snapshot.courseRankUrl,
      `/res/trophy/normal.png`,
      `/res/trophy/bronze.png`,
      `/res/trophy/silver.png`,
      `/res/trophy/gold.png`,
      `/res/trophy/rainbow.png`,
      `/res/character/${data.snapshot.gameVersion}.png`,
      getLogoUrl(data.snapshot.gameVersion, snapshotRegion),
      `/res/bg/${data.snapshot.gameVersion}.png`,
      `/res/badge/${data.snapshot.gameVersion}/none.png`,
      `/res/badge/${data.snapshot.gameVersion}/sync.png`,
      `/res/badge/${data.snapshot.gameVersion}/fc.png`,
      `/res/badge/${data.snapshot.gameVersion}/fc+.png`,
      `/res/badge/${data.snapshot.gameVersion}/fs.png`,
      `/res/badge/${data.snapshot.gameVersion}/fs+.png`,
      `/res/badge/${data.snapshot.gameVersion}/fdx.png`,
      `/res/badge/${data.snapshot.gameVersion}/fdx+.png`,
      `/res/label/new.png`,
      `/res/label/old.png`,
      ...newSongsB15.map(s => s.cover),
      ...oldSongsB35.map(s => s.cover),
    ];

    const cache: ImageCache = {};
    const failedImages: { url: string; error: unknown }[] = [];
    await Promise.all(
      imagesToCache.map(async (url) => {
        if (url.startsWith('data:')) return;
        try {
          const img = await fetchImageForServer(url);
          let memo: Image | null = null;
          cache[url] = async () => memo || (memo = await loadImage(img));
        } catch (error) {
          failedImages.push({ url, error });
          log.warn({ url, err: error instanceof Error ? error.message : error }, `⚠️ Failed to cache image: ${url}`);
        }
      })
    );
    if (failedImages.length > 0) {
      log.error({ count: failedImages.length }, `❌ ${failedImages.length} image(s) failed to load`);
      for (const { url, error } of failedImages) {
        log.error({ url, err: error instanceof Error ? error.message : String(error) }, `   - ${url}`);
      }
      return NextResponse.json(
        {
          error: 'Failed to fetch one or more images',
          failed: failedImages.map(({ url, error }) => ({
            url,
            message: error instanceof Error ? error.message : String(error),
          })),
          requestId,
        },
        { status: 502 }
      );
    }
    log.info({ count: Object.keys(cache).length, durationMs: Date.now() - startTime }, `✅ Cached ${Object.keys(cache).length} images in ${Date.now() - startTime}ms`);

    // Render the image using skia-canvas
    log.info('🎨 Rendering image with skia-canvas...');
    startTime = Date.now();
    const canvas = await renderImage(data, snapshotRegion, cache, visitableProfileAt);
    log.info({ durationMs: Date.now() - startTime }, `✅ Image rendered in ${Date.now() - startTime}ms`);

    // Convert canvas to WEBP buffer
    log.info('💾 Converting to WEBP buffer...');
    startTime = Date.now();
    const buffer = await canvas.toBuffer('webp', {
      density: scale,
    });
    log.info({ size: buffer.length, durationMs: Date.now() - startTime }, `✅ Buffer created, size: ${buffer.length} bytes in ${Date.now() - startTime}ms`);

    // Use snapshot ID for filename
    const sanitizedName = `snapshot-${snapshotId}`;

    log.info('🎉 Export completed successfully!');
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Content-Disposition': `attachment; filename="maimai-profile-${sanitizedName}.webp"`,
        'Content-Length': buffer.length.toString(),
        'X-Request-Id': requestId,
      },
    });

  } catch (error) {
    log.error({ err: error instanceof Error ? { message: error.message, stack: error.stack } : error }, '💥 Failed to generate image');

    return NextResponse.json(
      {
        error: 'Failed to generate image',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId,
      },
      { status: 500 }
    );
  }
}
