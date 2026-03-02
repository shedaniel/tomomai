import { getRatingImageUrl, splitSongs } from '@/lib/rating-calculator';
import { ImageCache, renderImage, SongForRender } from '@/lib/render-image';
import { fetchImageForServer, fontsLoaded } from '@/lib/render-image-server';
import type { Region } from '@/lib/types';
import { NextRequest, NextResponse } from 'next/server';
import { Image, loadImage } from 'skia-canvas';
import { getTypeBadgeUrl } from '@/lib/utils';
import { prepareExportImageData } from '@/server/queries/export-image';

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  console.log('🚀 Starting skia-canvas export-image API request');
  try {
    await fontsLoaded;

    const snapshotId = request.nextUrl.searchParams.get('snapshotId');
    const scaleParam = request.nextUrl.searchParams.get('scale');
    const scale = scaleParam === '1' ? 1 : 2; // Accept 1 or 2, default to 2
    const username = request.nextUrl.searchParams.get('username') ?? undefined;
    const region = (request.nextUrl.searchParams.get('region') ?? undefined) as Region | undefined;
    console.log('📋 Received snapshot ID:', snapshotId, 'scale:', scale);

    if (!snapshotId) {
      console.error('❌ No snapshot ID provided');
      return NextResponse.json({ error: 'Snapshot ID is required' }, { status: 400 });
    }

    const prepareDataResult = await prepareExportImageData(snapshotId, username, region);
    if (prepareDataResult.type === "error") {
      return NextResponse.json({ error: prepareDataResult.error }, { status: 404 });
    }

    const { data, visitableProfileAt } = prepareDataResult;

    // Pre-cache images
    console.log('🖼️ Pre-caching images...');
    let startTime = Date.now();
    const { newSongsB15, oldSongsB35 } = splitSongs(data.songs, data.snapshot.gameVersion);

    const imagesToCache = [
      getTypeBadgeUrl("dx"),
      getTypeBadgeUrl("std"),
      getRatingImageUrl(data.snapshot.rating),
      data.snapshot.iconUrl,
      data.snapshot.classRankUrl,
      data.snapshot.courseRankUrl,
      `/res/trophy/normal.png`,
      `/res/trophy/bronze.png`,
      `/res/trophy/silver.png`,
      `/res/trophy/gold.png`,
      `/res/trophy/rainbow.png`,
      `/res/character/${data.snapshot.gameVersion}.png`,
      `/res/logo/${data.snapshot.gameVersion}.png`,
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
    await Promise.all(
      imagesToCache.map(async (url) => {
        try {
          if (url.startsWith('data:')) return;
          return fetchImageForServer(url).then(async img => {
            let memo: Image | null = null;
            cache[url] = async () => memo || (memo = await loadImage(img));
          });
        } catch (error) {
          console.warn(`⚠️ Failed to cache image: ${url}`, error);
        }
      })
    );
    console.log(`✅ Cached ${Object.keys(cache).length} images in ${Date.now() - startTime}ms`);

    // Render the image using skia-canvas
    console.log('🎨 Rendering image with skia-canvas...');
    startTime = Date.now();
    const canvas = await renderImage(data, cache, visitableProfileAt);
    console.log(`✅ Image rendered in ${Date.now() - startTime}ms`);

    // Convert canvas to WEBP buffer
    console.log('💾 Converting to WEBP buffer...');
    startTime = Date.now();
    const buffer = await canvas.toBuffer('webp', {
      density: scale,
    });
    console.log(`✅ Buffer created, size: ${buffer.length} bytes in ${Date.now() - startTime}ms`);

    // Use snapshot ID for filename
    const sanitizedName = `snapshot-${snapshotId}`;

    console.log('🎉 Export completed successfully!');
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Content-Disposition': `attachment; filename="maimai-profile-${sanitizedName}.webp"`,
        'Content-Length': buffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('💥 Failed to generate image:', error);
    console.error('📍 Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    return NextResponse.json(
      {
        error: 'Failed to generate image',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
