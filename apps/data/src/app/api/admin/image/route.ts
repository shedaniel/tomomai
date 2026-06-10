import { convertToWebp } from "@/lib/image-converter";
import { fetchImageBuffer } from "@/lib/image-converter";
import { logger } from "@/lib/logger";
import { listCoverKeys, uploadCoverToR2 } from "@/lib/r2";
import { UpdateSong } from "@/lib/types/update";
import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";

const MAIMAI_COVER_PATTERN = /^https?:\/\/maimaidx(?:-eng)?\.com\/maimai-mobile\/img\/Music\/(.+)$/;
// Lxns CN jacket: https://assets2.lxns.net/maimai/jacket/{id}.png — namespace under
// `lxns_{id}` to avoid collisions with the JP/INTL md5-style filenames.
const LXNS_COVER_PATTERN = /^https?:\/\/assets2?\.lxns\.net\/maimai\/jacket\/(\d+)\.png$/;

const STATIC_ASSETS: { url: string; basename: string }[] = [
  { url: "https://maimaidx.jp/maimai-mobile/img/music_dx.png", basename: "music_dx" },
  { url: "https://maimaidx.jp/maimai-mobile/img/music_standard.png", basename: "music_standard" },
];

// Returns a stable "filename" key for a cover URL (used for de-dup and R2 lookup).
// Returns null for URLs we don't know how to cache.
function extractFilename(url: string): string | null {
  const maimai = url.match(MAIMAI_COVER_PATTERN);
  if (maimai) return maimai[1];
  const lxns = url.match(LXNS_COVER_PATTERN);
  if (lxns) return `lxns_${lxns[1]}.png`;
  return null;
}

// Covers are stored as object keys ("covers/<file>.webp"), never full R2 URLs.
// A value without a scheme is already a key and needs no processing; only
// absolute URLs from the scrapers are candidates for caching.
function isObjectKey(cover: string): boolean {
  return !/^https?:\/\//.test(cover) && !cover.startsWith("data:");
}

function isJpDomain(url: string): boolean {
  return url.includes("maimaidx.com/");
}

async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    const adminToken = process.env.ADMIN_UPDATE_TOKEN;
    if (!adminToken) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (token !== adminToken) {
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 403 }
      );
    }

    const requestId = nanoid(10);
    const log = logger.child({ route: "admin/image", requestId });

    const body = await request.json();
    const songs: UpdateSong[] = body.songs;

    if (!songs || !Array.isArray(songs)) {
      return NextResponse.json(
        { error: "Missing or invalid 'songs' array in request body" },
        { status: 400 }
      );
    }

    log.info({ songCount: songs.length }, "Image processing starting");

    // Collect unique filenames from cover URLs, preferring jp domain.
    // Covers that are already object keys (no scheme) need no processing.
    const filenameToUrl = new Map<string, string>();
    for (const song of songs) {
      if (isObjectKey(song.cover)) continue;
      const filename = extractFilename(song.cover);
      if (!filename) continue;
      const existing = filenameToUrl.get(filename);
      if (!existing || (!isJpDomain(existing) && isJpDomain(song.cover))) {
        filenameToUrl.set(filename, song.cover);
      }
    }

    log.info({ uniqueCovers: filenameToUrl.size }, "Unique maimai cover URLs found");

    // Get existing covers in R2
    const existingKeys = await listCoverKeys();
    log.info({ existingR2Covers: existingKeys.size }, "Existing covers in R2");

    // Build filename -> object key map ("covers/<basename>.webp")
    const filenameToKey = new Map<string, string>();

    let uploaded = 0;
    let skipped = 0;

    // Determine which filenames need downloading vs already exist
    type CoverTask = { filename: string; basename: string; url: string };
    const toDownload: CoverTask[] = [];

    for (const [filename, url] of filenameToUrl) {
      const basename = filename.replace(/\.[^.]+$/, "");
      const webpKey = `${basename}.webp`;

      if (existingKeys.has(webpKey)) {
        filenameToKey.set(filename, `covers/${webpKey}`);
        skipped++;
      } else {
        toDownload.push({ filename, basename, url });
      }
    }

    log.info({ toDownload: toDownload.length, skipped }, "Cover download plan");

    // Download, convert, upload in batches of 10
    await processBatch(toDownload, 10, async ({ filename, basename, url }) => {
      log.debug({ filename, url }, "Downloading cover");
      const buffer = await fetchImageBuffer(url, "");
      const webpBuffer = await convertToWebp(buffer);
      log.debug({ filename, originalSize: buffer.length, webpSize: webpBuffer.length }, "Converted to WebP");
      const { key } = await uploadCoverToR2(webpBuffer, basename);
      filenameToKey.set(filename, key);
      uploaded++;
      log.debug({ filename, basename }, "Uploaded cover to R2");
    });

    // Cache static assets (DX/Standard type badges) if missing
    for (const { url, basename } of STATIC_ASSETS) {
      const webpKey = `${basename}.webp`;
      if (!existingKeys.has(webpKey)) {
        log.info({ basename, url }, "Caching static asset to R2");
        const buffer = await fetchImageBuffer(url, "");
        const webpBuffer = await convertToWebp(buffer);
        await uploadCoverToR2(webpBuffer, basename);
        log.info({ basename }, "Static asset cached");
      }
    }

    // Replace cover URLs in songs with object keys. Covers we don't know how
    // to cache (non-maimai/lxns hosts) stay absolute URLs as-is.
    let unchanged = 0;
    const updatedSongs = songs.map((song) => {
      if (isObjectKey(song.cover)) {
        unchanged++;
        return song;
      }
      const filename = extractFilename(song.cover);
      if (!filename) {
        unchanged++;
        return song;
      }
      const coverKey = filenameToKey.get(filename);
      if (!coverKey) {
        unchanged++;
        return song;
      }
      return { ...song, cover: coverKey };
    });

    const stats = { uploaded, skipped, unchanged };
    log.info({ stats }, "Image processing complete");

    return NextResponse.json({
      songs: updatedSongs,
      stats,
    });
  } catch (error) {
    logger.error({ err: error, route: "admin/image" }, "Error in admin image route");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
