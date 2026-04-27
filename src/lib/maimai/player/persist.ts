import { nanoid } from "nanoid";
import { db } from "../../db";
import { userSnapshots } from "../../db/schema-pg";
import { logger } from "../../logger";
import { getCurrentVersion } from "../../metadata";
import { Region } from "../../types";
import type { PlayerData } from "../types";

export async function createUserSnapshot(
  userId: string,
  region: Region,
  playerData: PlayerData,
): Promise<number> {
  const publicId = nanoid();

  logger.info(`Creating user snapshot with publicId: ${publicId}`);

  const [inserted] = await db.insert(userSnapshots).values({
    publicId: publicId,
    userId: userId,
    region: region,
    fetchedAt: new Date(),
    gameVersion: getCurrentVersion(region),
    rating: playerData.rating,
    courseRankUrl: playerData.courseRankUrl,
    classRankUrl: playerData.classRankUrl,
    stars: playerData.stars,
    versionPlayCount: playerData.versionPlayCount,
    totalPlayCount: playerData.totalPlayCount,
    iconUrl: playerData.iconBase64,
    displayName: playerData.displayName,
    title: playerData.title,
    titleType: playerData.titleType,
  }).returning({ id: userSnapshots.id });

  logger.info(`User snapshot created successfully with internal ID: ${inserted.id}`);
  return inserted.id;
}
