import { eq } from "drizzle-orm";
import { db } from "../../db";
import { userAlbums } from "../../db/schema-pg";
import { convertJpegToAvif } from "../../image-converter";
import { logger } from "../../logger";
import { getCurrentVersion } from "../../metadata";
import { deleteFromR2, uploadToR2 } from "../../r2";
import { Region } from "../../types";
import { buildSongLookupMaps } from "../songs/persist";
import type { AlbumData } from "../types";

export const MAX_STORAGE_BYTES = 8 * 1024 * 1024; // 8 MB

// AVIF quality for album images. q40 is ~0.35x the size of q80 with no
// perceptible quality loss on these 1056x594 result-screen photos, keeping
// ~177 albums within the 8 MB cap.
export const ALBUM_AVIF_QUALITY = 40;

export async function enforceStorageLimit(userId: string): Promise<void> {
  const userAlbumsList = await db.query.userAlbums.findMany({
    where: eq(userAlbums.userId, userId),
    orderBy: [userAlbums.createdAt],
    columns: { id: true, imageKey: true, imageSize: true },
  });

  let totalSize = userAlbumsList.reduce((sum, a) => sum + a.imageSize, 0);

  if (totalSize <= MAX_STORAGE_BYTES) {
    logger.debug(`User ${userId} storage: ${totalSize} bytes (within ${MAX_STORAGE_BYTES} byte limit)`);
    return;
  }

  logger.info(`User ${userId} storage: ${totalSize} bytes (exceeds ${MAX_STORAGE_BYTES} byte limit), cleaning up...`);

  for (const album of userAlbumsList) {
    if (totalSize <= MAX_STORAGE_BYTES) {
      break;
    }

    try {
      await deleteFromR2(album.imageKey);
      logger.debug(`Deleted R2 object: ${album.imageKey}`);
    } catch (error) {
      logger.error(error, `Failed to delete R2 object: ${album.imageKey}`);
    }

    await db.delete(userAlbums).where(eq(userAlbums.id, album.id));
    totalSize -= album.imageSize;
    logger.info(`Deleted album ${album.id}, freed ${album.imageSize} bytes`);
  }

  logger.info(`User ${userId} storage cleanup complete: ${totalSize} bytes remaining`);
}

/**
 * Persists album metadata and uploads images for the user. Skips duplicates
 * (by takenAt) and albums whose songId can't be resolved BEFORE invoking the
 * image-bytes callback, so HTTP-backed callers don't waste bandwidth.
 */
export async function persistAlbumData(
  userId: string,
  region: Region,
  albumData: AlbumData[],
  fetchImageBytes: (album: AlbumData) => Promise<Buffer>,
): Promise<void> {
  if (albumData.length === 0) {
    logger.debug("No album data to persist");
    return;
  }

  logger.info(`Persisting ${albumData.length} albums for user ${userId}`);

  const existingAlbums = await db.query.userAlbums.findMany({
    where: eq(userAlbums.userId, userId),
    columns: { takenAt: true },
  });

  const existingTakenAt = new Set(existingAlbums.map(a => a.takenAt.getTime()));

  const gameVersion = getCurrentVersion(region);
  const { songLookup } = await buildSongLookupMaps(region, gameVersion);

  const albumsToUpload: Array<AlbumData & { songId: bigint }> = [];

  for (const album of albumData) {
    if (existingTakenAt.has(album.takenAt.getTime())) {
      logger.debug(`Skipping duplicate album: ${album.songName} at ${album.takenAt.toISOString()}`);
      continue;
    }

    const lookupKey = `${album.songName}|${album.difficulty}|${album.musicType}`;
    const songId = songLookup.get(lookupKey);

    if (!songId) {
      logger.warn(`Could not find song: ${album.songName} (${album.difficulty}, ${album.musicType})`);
      continue;
    }

    albumsToUpload.push({ ...album, songId });
  }

  logger.info(`${albumsToUpload.length} new albums to upload`);

  const albumInserts: typeof userAlbums.$inferInsert[] = [];

  for (const album of albumsToUpload) {
    try {
      const jpegBuffer = await fetchImageBytes(album);
      const avifBuffer = await convertJpegToAvif(jpegBuffer, ALBUM_AVIF_QUALITY);
      const { key, size } = await uploadToR2(avifBuffer, "image/avif");

      albumInserts.push({
        userId,
        songId: album.songId,
        takenAt: album.takenAt,
        venue: album.venue,
        imageKey: key,
        imageSize: size,
      });

      logger.debug(`Uploaded album: ${album.songName} -> ${key}`);
    } catch (error) {
      logger.error(error, `Failed to process album: ${album.songName}`);
    }
  }

  if (albumInserts.length > 0) {
    await db.insert(userAlbums).values(albumInserts);
    logger.info(`Inserted ${albumInserts.length} album records`);
  }

  await enforceStorageLimit(userId);
}
