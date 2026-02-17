import { getServerSession } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { ImageCache, renderLastCreditImage } from '@/lib/render-image';
import { fetchImageForServer } from '@/lib/render-image-server';
import { Image, loadImage } from 'skia-canvas';
import { getRatingImageUrl } from '@/lib/rating-calculator';
import { DIFFICULTY_ENUM } from '@/lib/db/types';
import { prepareCreditData } from '@/server/services/credit-data';
import { db } from '@/lib/db';
import { user, userSnapshots } from '@/lib/db/schema-pg';
import { and, eq } from 'drizzle-orm';

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  console.log('Starting last-credit image API request');
  try {
    // Parse query parameters
    const region = request.nextUrl.searchParams.get('region') as 'intl' | 'jp' | null;
    const beforeDateStr = request.nextUrl.searchParams.get('beforeDate');
    const scaleParam = request.nextUrl.searchParams.get('scale');
    const snapshotId = request.nextUrl.searchParams.get('snapshotId');
    const scale = scaleParam === '1' ? 1 : 2; // Accept 1 or 2, default to 2

    if (!region || (region !== 'intl' && region !== 'jp')) {
      return NextResponse.json({ error: 'Valid region (intl or jp) is required' }, { status: 400 });
    }

    // Determine userId based on mode
    let userId: string;

    if (snapshotId) {
      // PUBLIC MODE: Resolve userId from snapshot publicId
      const snapshot = await db
        .select({ userId: userSnapshots.userId })
        .from(userSnapshots)
        .innerJoin(user, eq(userSnapshots.userId, user.id))
        .where(and(
          eq(userSnapshots.publicId, snapshotId),
          eq(user.publishProfile, true)
        ))
        .limit(1);

      if (snapshot.length === 0) {
        return NextResponse.json({ error: 'Snapshot not found or not public' }, { status: 404 });
      }

      userId = snapshot[0].userId;
      console.log(`Public mode: Rendering for userId ${userId} (snapshot ${snapshotId})`);
    } else {
      // AUTHENTICATED MODE: Use session (existing behavior)
      const session = await getServerSession();
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      userId = session.user.id;
      console.log(`Authenticated mode: Rendering for logged-in user ${userId}`);
    }

    const beforeDate = beforeDateStr ? new Date(beforeDateStr) : undefined;
    if (beforeDateStr && isNaN(beforeDate!.getTime())) {
      return NextResponse.json({ error: 'Invalid beforeDate format' }, { status: 400 });
    }

    console.log(`Region: ${region}, beforeDate: ${beforeDate?.toISOString() ?? 'none'}, scale: ${scale}`);

    const prepareDataResult = await prepareCreditData(userId, region, beforeDate);
    if (prepareDataResult.type === "error") {
      return NextResponse.json({ error: prepareDataResult.error }, { status: 404 });
    }

    const { credit, snapshot, visitableProfileAt, hasNextCredit, hasPreviousCredit } = prepareDataResult;

    const imagesToCache = [
      "https://maimaidx.jp/maimai-mobile/img/music_dx.png",
      "https://maimaidx.jp/maimai-mobile/img/music_standard.png",
      getRatingImageUrl(snapshot.rating),
      snapshot.iconUrl,
      snapshot.classRankUrl,
      snapshot.courseRankUrl,
      `/res/trophy/normal.png`,
      `/res/trophy/bronze.png`,
      `/res/trophy/silver.png`,
      `/res/trophy/gold.png`,
      `/res/trophy/rainbow.png`,
      `/res/character/${snapshot.gameVersion}.png`,
      `/res/logo/${snapshot.gameVersion}.png`,
      `/res/bg/${snapshot.gameVersion}.png`,
      `/res/bg/${snapshot.gameVersion}_long.png`,
      `/res/badge/${snapshot.gameVersion}/none.png`,
      `/res/badge/${snapshot.gameVersion}/sync.png`,
      `/res/badge/${snapshot.gameVersion}/fc.png`,
      `/res/badge/${snapshot.gameVersion}/fc+.png`,
      `/res/badge/${snapshot.gameVersion}/fs.png`,
      `/res/badge/${snapshot.gameVersion}/fs+.png`,
      `/res/badge/${snapshot.gameVersion}/fdx.png`,
      `/res/badge/${snapshot.gameVersion}/fdx+.png`,
      ...['percentage_blue', 'percentage_red', 'percentage_gold',
        'score_blue', 'score_red', 'score_gold', 'score_big_blue', 'score_big_red', 'score_big_gold',
        'score_num_count', 'score_num_count_big',
        'level_basic', 'level_advanced', 'level_expert', 'level_master', 'level_remaster']
        .map(path => `/res/numbers/${path}.png`),
      ...['score_table', 'fast_late', 'track_1', 'track_2', 'track_3',
        'dxscore', 'star_1', 'star_2', 'star_3']
        .map(path => `/res/songs/${path}.png`),
      ...['base', 'sync_base', 'sync', 'fc_base', 'fc', 'fc+', 'ap_base', 'ap', 'ap+',
        'fs_base', 'fs', 'fs+', 'fdx_base', 'fdx', 'fdx+']
        .map(path => `/res/icons/${path}.png`),
      ...Object.values(DIFFICULTY_ENUM).map(difficulty => `/res/songs/song_${difficulty}.png`),
      ...Object.values(DIFFICULTY_ENUM).map(difficulty => `/res/songs/music_jacket_${difficulty}.png`),
      ...credit.tracks.map(s => s.cover),
    ];

    const startTime = Date.now();
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
    const canvas = await renderLastCreditImage(credit, snapshot, cache);

    // Convert canvas to WEBP buffer and return
    const buffer = await canvas.toBuffer('webp', { density: scale });
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Content-Disposition': `attachment; filename="maimai-last-credit.webp"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Failed to generate last credit image:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    return NextResponse.json(
      {
        error: 'Failed to generate image',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
