import { db } from '@/lib/db';
import { getRatingImageUrl, splitSongs } from '@/lib/rating-calculator';
import { ImageCache, renderImage, SongForRender } from '@/lib/render-image';
import { fetchImageForServer, fontsLoaded } from '@/lib/render-image-server';
import { songs, user, userScores, userSnapshots } from '@/lib/db/schema-pg';
import type { SnapshotWithSongs } from '@/lib/types';
import { and, eq, lt } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { Image, loadImage } from 'skia-canvas';

export const dynamic = "force-dynamic";

async function prepareData(snapshotPublicId: string): Promise<{
  type: "success",
  data: SnapshotWithSongs<SongForRender>,
  visitableProfileAt: string | null,
} | {
  type: "error",
  error: string,
}> {
  // Fetch snapshot data from database using publicId
  console.log('🔍 Fetching snapshot from database...');
  let startTime = Date.now();
  const snapshot = await db
    .select()
    .from(userSnapshots)
    .where(eq(userSnapshots.publicId, snapshotPublicId))
    .limit(1);

  if (snapshot.length === 0) {
    console.error('❌ Snapshot not found');
    return {
      type: "error",
      error: 'Snapshot not found',
    };
  }
  console.log(`✅ Snapshot fetched in ${Date.now() - startTime}ms`);

  // Get user privacy settings
  console.log('🔍 Fetching user privacy settings and songs with scores...');
  startTime = Date.now();
  const publishProfilePromise = db
    .select({ username: user.username, publishProfile: user.publishProfile })
    .from(user)
    .where(eq(user.id, snapshot[0].userId))
    .limit(1);
  const songsWithScoresPromise = db
    .select({
      songName: songs.songName,
      cover: songs.cover,
      difficulty: songs.difficulty,
      levelPrecise: songs.levelPrecise,
      type: songs.type,
      addedVersion: songs.addedVersion,
      achievement: userScores.achievement,
      fc: userScores.fc,
      fs: userScores.fs,
    })
    .from(userScores)
    .innerJoin(songs, eq(userScores.songId, songs.id))
    .where(and(
      eq(userScores.snapshotId, snapshot[0].id),
      lt(userScores.rank, 50),
    ))
    .orderBy(songs.songName, songs.difficulty);

  const [publishProfile, songsWithScores] = await Promise.all([publishProfilePromise, songsWithScoresPromise]);

  if (publishProfile.length === 0) {
    console.error('❌ User not found');
    return {
      type: "error",
      error: 'User not found',
    };
  }
  console.log(`✅ User privacy settings and ${songsWithScores.length} songs with scores fetched in ${Date.now() - startTime}ms`);

  // Determine visitable profile URL
  const visitableProfileAt = publishProfile[0].publishProfile && publishProfile[0].username
    ? publishProfile[0].username
    : null;

  const data: SnapshotWithSongs<SongForRender> = {
    snapshot: {
      ...snapshot[0],
      id: snapshot[0].publicId, // Use publicId as the external-facing id
    },
    songs: songsWithScores,
  };

  return {
    type: "success",
    data,
    visitableProfileAt,
  };
}

export async function GET(request: NextRequest) {
  console.log('🚀 Starting skia-canvas export-image API request');
  try {
    await fontsLoaded;

    const snapshotId = request.nextUrl.searchParams.get('snapshotId');
    const scaleParam = request.nextUrl.searchParams.get('scale');
    const scale = scaleParam === '1' ? 1 : 2; // Accept 1 or 2, default to 2
    console.log('📋 Received snapshot ID:', snapshotId, 'scale:', scale);

    if (!snapshotId) {
      console.error('❌ No snapshot ID provided');
      return NextResponse.json({ error: 'Snapshot ID is required' }, { status: 400 });
    }

    const prepareDataResult = await prepareData(snapshotId);
    if (prepareDataResult.type === "error") {
      return NextResponse.json({ error: prepareDataResult.error }, { status: 404 });
    }

    const { data, visitableProfileAt } = prepareDataResult;

    // Pre-cache images
    console.log('🖼️ Pre-caching images...');
    let startTime = Date.now();
    const { newSongsB15, oldSongsB35 } = splitSongs(data.songs, data.snapshot.gameVersion);

    const imagesToCache = [
      "https://maimaidx.jp/maimai-mobile/img/music_dx.png",
      "https://maimaidx.jp/maimai-mobile/img/music_standard.png",
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
