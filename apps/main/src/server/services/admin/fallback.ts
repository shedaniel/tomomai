import { VersionId } from "@/lib/metadata";
import { getLogger } from "@/lib/request-logger";
import { Difficulty, Level, Region, SongType } from "@/lib/types";
import { UpdateSong } from "@/lib/types/update";
import { PendingSong } from "@/server/utils/admin/type";
import { promises as fs } from "fs";
import { join } from "path";
import { asFetcher } from "./fetcher-utils";

type FallbackLevel = {
  "level": Level,
  "levelPrecise": number
}

type FallbackSong = {
  "title": string,
  "artist": string,
  "genre": string,
  "type": SongType,
  "addedVersion": VersionId,
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

export const FallbackFetcher = asFetcher(async (context) => {
  const fallback = await loadFallbackJsonData(context.region, context.version)
  if (!fallback) {
    context.notice.addDetail("No fallback file found");
    return [];
  }
  context.notice.addDetail(`Loaded ${fallback.length} fallback songs`);
  return fallback.flatMap(song => {
    const levels: PendingSong[] = []
    for (const diff of ["easy", "advanced", "expert", "master", "remaster", "utage"]) {
      const level = song.levels[diff as keyof typeof song.levels] as FallbackLevel | undefined;
      if (level) {
        levels.push({
          songName: song.title,
          type: song.type,
          difficulty: diff === "easy" ? "basic" : diff as Difficulty,
          artist: song.artist,
          cover: song.cover,
          level: level.level,
          levelPrecise: level.levelPrecise,
          genre: song.genre,
          addedVersion: song.addedVersion,
        });
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
