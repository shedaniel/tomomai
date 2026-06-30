import { getVersionByShortName, getVersionFromDate, getVersionInfo, parseDate, VersionId } from "@/lib/metadata";
import { normalizeName } from "@/lib/name-utils";
import { Level, NoteCounts } from "@/lib/types";
import { DxRatingResponse } from "@/lib/types/dxrating";
import { getLogger } from "@/lib/request-logger";
import { PendingSong } from "@/server/utils/admin/type";
import { asFetcher } from "./fetcher-utils";

const DXDATA_URL = "https://raw.githubusercontent.com/gekichumai/dxrating/refs/heads/main/packages/dxdata/dxdata.json";

export const DxDataFetcher = asFetcher(async ({ version, region, notice }) => {
  const res = await fetchDxDataJson();
  const sheetsWithBpm = res.songs.filter(s => !!s.bpm).length;
  const sheetsWithDesigner = res.songs.flatMap(s => s.sheets).filter(s => !!s.noteDesigner && s.noteDesigner !== "-").length;
  const sheetsWithNotes = res.songs.flatMap(s => s.sheets).filter(s => !!s.noteCounts).length;
  notice.addDetail(`${res.songs.length} songs, ${sheetsWithBpm} with BPM, ${sheetsWithDesigner} with designer, ${sheetsWithNotes} with note counts`);

  return res.songs.flatMap(song => song.sheets.map(sheet => ({
    songName: normalizeName(song.title),
    artist: song.artist,
    level: sheet.level.replace("?", "") as Level,
    levelPrecise: getInternalLevelFromDxData(sheet, version) ?? undefined,
    type: sheet.type !== "utage" ? sheet.type : "dx",
    difficulty: sheet.difficulty,
    bpm: !!song.bpm ? song.bpm : undefined,
    noteDesigner: !!sheet.noteDesigner && sheet.noteDesigner !== "-" ? sheet.noteDesigner : undefined,
    noteCounts: hasValidNoteCounts(sheet.noteCounts) ? fromDxRatingCounts(sheet.noteCounts) : undefined,
    addedVersion: !!sheet.version ? getVersionByShortName(region === "intl" && "intl" in (sheet.regionOverrides ?? {}) ? sheet.regionOverrides!["intl"].version ?? sheet.version : sheet.version)?.id : undefined
  }) satisfies PendingSong));
}, "only-modify");

// Helper function to fetch dxdata.json
export async function fetchDxDataJson(): Promise<DxRatingResponse> {
  getLogger().info("Fetching dxdata.json...");
  const dxDataResponse = await fetch(DXDATA_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  });

  if (dxDataResponse.status !== 200) {
    throw new Error(`Failed to fetch dxdata.json: HTTP ${dxDataResponse.status}`);
  }

  const dxData = await dxDataResponse.json();
  getLogger().info(`Loaded ${dxData.songs.length} songs from dxdata.json`);
  return dxData;
}

function getInternalLevelFromDxData(
  sheet: DxRatingResponse["songs"][number]["sheets"][number],
  version: VersionId,
): number | null {
  const currentVersionInfo = getVersionInfo(version);
  if (!currentVersionInfo) {
    return null;
  }

  let internalLevel: number;

  // Check if multiverInternalLevelValue exists and contains our version
  if (sheet.multiverInternalLevelValue && typeof sheet.multiverInternalLevelValue === 'object') {
    const versionLevel = sheet.multiverInternalLevelValue[currentVersionInfo.shortName];
    if (typeof versionLevel === 'number') {
      internalLevel = versionLevel;
    } else {
      // Fallback to default internalLevelValue
      internalLevel = sheet.internalLevelValue;
    }
  } else {
    // Use default internalLevelValue
    internalLevel = sheet.internalLevelValue;
  }

  // Convert to 10x format and return
  return Math.round(internalLevel * 10);
}

type DxRatingNoteCounts = DxRatingResponse["songs"][number]["sheets"][number]["noteCounts"];

function hasValidNoteCounts(counts: DxRatingNoteCounts): boolean {
  return counts.tap != null && counts.hold != null && counts.slide != null && counts.break != null;
}

function fromDxRatingCounts(counts: DxRatingNoteCounts): NoteCounts {
  return {
    tap: counts.tap!,
    hold: counts.hold!,
    slide: counts.slide!,
    touch: counts.touch ?? 0,
    break: counts.break!,
  };
}
