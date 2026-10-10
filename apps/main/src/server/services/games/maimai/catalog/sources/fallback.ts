import "server-only";
import { getLogger } from "@/lib/request-logger";
import { normalizeName } from "@/lib/name-utils";
import type { Region } from "@/lib/games/ids";
import type { SongType } from "@/lib/games/maimai/types";
import { asCatalogFetcher } from "@/server/services/catalog/ingestion/merge";
import type { SourceChart } from "@/server/services/catalog/ingestion/types";
import { promises as fs } from "fs";
import { join } from "path";
import { maimaiChart } from "../chart";
import { normalizeGenre } from "../genres";

type FallbackLevel = {
  "level": string,
  "levelPrecise": number
}

type FallbackSong = {
  "title": string,
  "artist": string,
  "genre": string,
  "type": SongType,
  "addedVersion": number,
  "cover": string,
  "levels": {
    "easy"?: FallbackLevel,
    "advanced"?: FallbackLevel,
    "expert"?: FallbackLevel,
    "master"?: FallbackLevel,
    "remaster"?: FallbackLevel,
    "utage"?: FallbackLevel
  }
}

export const FallbackFetcher = asCatalogFetcher(async (context) => {
  const fallback = await loadFallbackJsonData(context.region, context.version)
  if (!fallback) {
    context.notice.addDetail("No fallback file found");
    return [];
  }
  context.notice.addDetail(`Loaded ${fallback.length} fallback songs`);
  return fallback.flatMap(song => {
    const levels: SourceChart[] = []
    for (const diff of ["easy", "advanced", "expert", "master", "remaster", "utage"] as const) {
      const level = song.levels[diff];
      if (level) {
        levels.push(maimaiChart({
          songName: normalizeName(song.title),
          type: song.type,
          difficulty: diff === "easy" ? "basic" : diff,
          artist: song.artist,
          cover: song.cover,
          level: level.level,
          levelPrecise: level.levelPrecise,
          genre: normalizeGenre(song.genre),
          addedVersion: song.addedVersion,
        }));
      }
    }
    return levels;
  })
}, "only-fallback")

// Helper function to load fallback JSON data
async function loadFallbackJsonData(region: Region, version: number): Promise<FallbackSong[] | null> {
  try {
    const filePath = join(process.cwd(), "data", "extra", `${region}-${version}.json`);
    getLogger().debug(`Checking for fallback JSON file: ${filePath}`);

    const fileContent = await fs.readFile(filePath, "utf-8");
    const jsonData = JSON.parse(fileContent);

    getLogger().info(`Loaded ${jsonData.length} fallback songs from ${region}-${version}.json`);
    return jsonData;
  } catch (error) {
    getLogger().info(`No fallback JSON file found for ${region}-${version} or error reading it: ${error instanceof Error ? error.message : "Unknown error"}`);
    return null;
  }
}
