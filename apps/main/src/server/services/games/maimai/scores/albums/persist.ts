import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userAlbums } from "@/lib/db/schema-pg";
import { convertJpegToAvif } from "@/lib/image-converter";
import { deleteFromR2, uploadToR2 } from "@/lib/r2";
import { getLogger } from "@/lib/request-logger";
import { formatChartLabel } from "@/lib/games/presentation";
import { chartKey } from "@/server/services/games/score-storage";
import type { ChartResolutionMap } from "@/server/services/games/types";
import { chartTypeToCode, difficultyToCode } from "@/lib/games/maimai/codes";
import type { AlbumData } from "../types";

export const MAX_STORAGE_BYTES = 8 * 1024 * 1024; // 8 MB

// AVIF quality for album images. q40 is ~0.35x the size of q80 with no
// perceptible quality loss on these 1056x594 result-screen photos, keeping
// ~177 albums within the 8 MB cap.
const ALBUM_AVIF_QUALITY = 40;

async function enforceStorageLimit(userId: string): Promise<void> {
  const userAlbumsList = await db.query.userAlbums.findMany({
    where: and(eq(userAlbums.userId, userId), eq(userAlbums.game, "maimai")),
    orderBy: [userAlbums.createdAt],
    columns: { id: true, imageKey: true, imageSize: true },
  });

  let totalSize = userAlbumsList.reduce((sum, a) => sum + a.imageSize, 0);
  if (totalSize <= MAX_STORAGE_BYTES) return;

  const log = getLogger();
  let deleted = 0;
  for (const album of userAlbumsList) {
    if (totalSize <= MAX_STORAGE_BYTES) {
      break;
    }

    try {
      await deleteFromR2(album.imageKey);
    } catch (error) {
      log.error({ err: error, userId, filename: album.imageKey }, "Could not delete an album image from R2");
    }

    await db.delete(userAlbums).where(and(eq(userAlbums.id, album.id), eq(userAlbums.game, "maimai")));
    totalSize -= album.imageSize;
    deleted++;
  }

  log.info({ userId, count: deleted, size: totalSize }, "Deleted the oldest albums over the storage limit");
}

/**
 * Persists album metadata and uploads images for the user. Skips duplicates
 * (by takenAt) and albums whose songId can't be resolved BEFORE invoking the
 * image-bytes callback, so HTTP-backed callers don't waste bandwidth.
 */
export async function persistAlbumData(
  userId: string,
  chartResolution: ChartResolutionMap,
  albumData: AlbumData[],
  fetchImageBytes: (album: AlbumData) => Promise<Buffer>,
): Promise<void> {
  if (albumData.length === 0) return;

  const log = getLogger();
  const existingAlbums = await db.query.userAlbums.findMany({
    where: and(eq(userAlbums.userId, userId), eq(userAlbums.game, "maimai")),
    columns: { takenAt: true },
  });

  const existingTakenAt = new Set(existingAlbums.map(a => a.takenAt.getTime()));

  const albumsToUpload: Array<AlbumData & { songId: bigint }> = [];

  for (const album of albumData) {
    if (existingTakenAt.has(album.takenAt.getTime())) continue;

    const chart = { songName: album.songName, difficulty: difficultyToCode(album.difficulty), chartType: chartTypeToCode(album.musicType) };
    const songId = chartResolution.get(chartKey(chart));
    if (!songId) {
      log.warn({ chartLabel: formatChartLabel("maimai", chart) }, "Album chart is not in the catalog");
      continue;
    }

    albumsToUpload.push({ ...album, songId });
  }

  const albumInserts: typeof userAlbums.$inferInsert[] = [];

  for (const album of albumsToUpload) {
    try {
      const jpegBuffer = await fetchImageBytes(album);
      const avifBuffer = await convertJpegToAvif(jpegBuffer, ALBUM_AVIF_QUALITY);
      const { key, size } = await uploadToR2(avifBuffer, "image/avif");

      albumInserts.push({
        userId,
        game: "maimai",
        songId: album.songId,
        takenAt: album.takenAt,
        venue: album.venue,
        imageKey: key,
        imageSize: size,
      });
    } catch (error) {
      log.error({ err: error, userId }, "Could not store an album image");
    }
  }

  if (albumInserts.length > 0) {
    await db.insert(userAlbums).values(albumInserts);
    log.info({ userId, count: albumInserts.length }, "Stored new albums");
  }

  await enforceStorageLimit(userId);
}
