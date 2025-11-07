import { db } from '@/lib/db';
import { getRatingImageUrl, splitSongs } from '@/lib/rating-calculator';
import { ImageCache, renderImage, SongForRender } from '@/lib/render-image';
import { fetchImageForServer } from '@/lib/render-image-server';
import { songs, user, userScores, userSnapshots } from '@/lib/db/schema-pg';
import type { SnapshotWithSongs } from '@/lib/types';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { FontLibrary, Image, loadImage } from 'skia-canvas';
import path from 'path';

export const dynamic = "force-dynamic";

// Load fonts once at module initialization
const fontsLoaded = (async () => {
  try {
    const fontsDir = path.join(process.cwd(), 'public', 'res', 'fonts');
    
    FontLibrary.use('Inter', [path.join(fontsDir, 'Inter-VariableFont_opsz,wght.woff2')]);
    FontLibrary.use('Murecho', [path.join(fontsDir, 'Murecho-VariableFont_wght.woff2')]);
    FontLibrary.use('Noto Sans JP', [path.join(fontsDir, 'NotoSansJP-VariableFont_wght.woff2')]);
    FontLibrary.use('Geist Mono', [path.join(fontsDir, 'GeistMono-VariableFont_wght.woff2')]);
    
    console.log('✅ Fonts loaded successfully');
  } catch (error) {
    console.error('❌ Failed to load fonts:', error);
  }
})();

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
    })
    .from(userScores)
    .innerJoin(songs, eq(userScores.songId, songs.id))
    .where(eq(userScores.snapshotId, snapshot[0].id))
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
    console.log('📋 Received snapshot ID:', snapshotId);
    
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
      `/res/shine/${data.snapshot.gameVersion}.png`,
      `/res/down/${data.snapshot.gameVersion}.png`,
      `/res/character/${data.snapshot.gameVersion}.png`,
      `/res/logo/${data.snapshot.gameVersion}.png`,
      `/res/bg/${data.snapshot.gameVersion}.png`,
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

    // Convert canvas to JPEG buffer
    console.log('💾 Converting to JPEG buffer...');
    startTime = Date.now();
    const buffer = await canvas.toBuffer('jpeg', {
      density: 2,
      quality: 0.7,
    });
    console.log(`✅ Buffer created, size: ${buffer.length} bytes in ${Date.now() - startTime}ms`);

    // Use snapshot ID for filename
    const sanitizedName = `snapshot-${snapshotId}`;

    console.log('🎉 Export completed successfully!');
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="maimai-profile-${sanitizedName}.png"`,
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
