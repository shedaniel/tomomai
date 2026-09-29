import "server-only";
import { uploadIconToR2 } from "@/lib/r2";
import type { GameSiteClient } from "./sega/http";

/** Copies a player icon to R2 and returns the copy's public URL. */
export async function mirrorPlayerIcon(site: Pick<GameSiteClient, "bytes">, url: string, signal: AbortSignal): Promise<string> {
  const { buffer, contentType } = await site.bytes(url);
  const { url: mirrored } = await uploadIconToR2(buffer, contentType, signal);
  return mirrored;
}
