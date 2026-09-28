import "server-only";
import { logger } from "@/lib/logger";
import { uploadIconToR2 } from "@/lib/r2";
import type { PlayerData } from "../types";

export async function uploadPlayerIcon(playerData: PlayerData): Promise<string> {
  let iconUrl = "";
  if (playerData.iconBytes && playerData.iconContentType) {
    const { url } = await uploadIconToR2(playerData.iconBytes, playerData.iconContentType);
    iconUrl = url;
    logger.info(`Uploaded icon to R2: ${url}`);
  }
  return iconUrl;
}
