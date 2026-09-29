import "server-only";
import { siteUrl } from "@/lib/games/sites";
import { Versions } from "@/lib/games/maimai/versions";
import { getVersionFromDate } from "@/lib/games/versions";
import { normalizeName } from "@/lib/name-utils";
import { normalizeGenre } from "../genres";
import { NoteCounts, Region } from "@/lib/types";
import type { Difficulty, SongType } from "@/lib/games/maimai/types";
import { asCatalogFetcher } from "@/server/services/catalog/ingestion/merge";
import { catalogChartKey } from "@/server/services/catalog/ingestion/normalize-charts";
import type { SourceChart } from "@/server/services/catalog/ingestion/types";
import { otogeDbUrl, parseOtogeDbConstant, parseOtogeDbDate } from "@/server/services/catalog/sources/otoge-db";
import { Logger } from "pino";
import { maimaiChart, maimaiLevelPolicy } from "../chart";

const MAIMAI_SONGS_JSON_URL = otogeDbUrl("maimai/data/music-ex.json");
const MAIMAI_SONGS_JSON_URL_INTL = otogeDbUrl("maimai/data/music-ex-intl.json");

const JP_FALLBACK_FOR_INTL: Partial<Record<number, string>> = {
  [Versions.MAIMAI_DX_PRISM.id]: otogeDbUrl("maimai/data/music-ex-prism-final.json"),
  [Versions.MAIMAI_DX_PRISM_PLUS.id]: otogeDbUrl("maimai/data/music-ex-prismplus-final.json"),
  [Versions.MAIMAI_DX_CIRCLE.id]: otogeDbUrl("maimai/data/music-ex-circle-final.json"),
  [Versions.MAIMAI_DX_CIRCLE_PLUS.id]: MAIMAI_SONGS_JSON_URL,
}

export const OtogeDbFetcher = asCatalogFetcher(async (context) => {
  let allRecords: SourceChart[] = []
  if (context.region === "jp") {
    allRecords = await fetchRecords(context.region, context.version, context.log);
    context.notice.addDetail(`${allRecords.length} charts from JP otoge-db`);
  } else {
    const jpRecordsLink = JP_FALLBACK_FOR_INTL[context.version]
    const [jpRecords, intlRecords] = await Promise.all([
      jpRecordsLink ? fetchRecordsWithUrl("jp", context.version, jpRecordsLink, context.log) : Promise.resolve([]),
      fetchRecords("intl", context.version, context.log),
    ]);
    context.notice.addDetail(`${intlRecords.length} INTL charts, ${jpRecords.length} JP fallback charts`);

    const jpByKey = new Map<string, SourceChart>();
    for (const record of jpRecords) {
      if (!jpByKey.has(catalogChartKey(record))) jpByKey.set(catalogChartKey(record), record);
    }
    const applyJpFallback = (record: SourceChart): SourceChart => {
      const jpRecord = jpByKey.get(catalogChartKey(record));
      if (!jpRecord) {
        return record;
      }
      return {
        ...jpRecord,
        ...record,
        ...Object.fromEntries(Object.entries(jpRecord).filter(([key]) => record[key as keyof SourceChart] === null)),
      };
    };

    allRecords = intlRecords.map(record => applyJpFallback(record));
    // A JP chart missing from the INTL data may already be in the catalog, so it can only modify.
    const intlKeys = new Set(intlRecords.map(catalogChartKey));
    allRecords.push(...jpRecords.filter(record => !intlKeys.has(catalogChartKey(record)))
      .map(r => ({ ...r, mode: "only-modify" as const })));
  }

  context.log.trace({ songKeys: allRecords.map(catalogChartKey) }, "Fetched records from otoge-db")

  return allRecords
})

interface LevelData {
  level: string;
  i: string;
  notes: string;
  notes_tap: string;
  notes_hold: string;
  notes_slide: string;
  notes_break: string;
  designer?: string;
}

type PrefixKeys<T, P extends string> = {
  [K in keyof T as `${P}_${K & string}`]: T[K];
};

type SongsJsonRecord = {
  sort: string;
  title: string;
  title_kana: string;
  artist: string;
  catcode: string;
  version: string;
  bpm: string;
  image_url: string;
  release: string;
  intl: "0" | "1";
  date_added: string;
  date_intl_added?: string;
  date_updated: string;
  date_intl_updated?: string;
} & Partial<PrefixKeys<LevelData, "lev_bas">>
  & Partial<PrefixKeys<LevelData, "lev_adv">>
  & Partial<PrefixKeys<LevelData, "lev_exp">>
  & Partial<PrefixKeys<LevelData, "lev_mas">>
  & Partial<PrefixKeys<LevelData, "lev_remas">>
  & Partial<PrefixKeys<LevelData, "lev_utage">>
  & Partial<PrefixKeys<LevelData, "dx_lev_bas">>
  & Partial<PrefixKeys<LevelData, "dx_lev_adv">>
  & Partial<PrefixKeys<LevelData, "dx_lev_exp">>
  & Partial<PrefixKeys<LevelData, "dx_lev_mas">>
  & Partial<PrefixKeys<LevelData, "dx_lev_remas">>;

async function fetchRecords(region: Region, version: number, log: Logger): Promise<SourceChart[]> {
  const url = region === "intl" ? MAIMAI_SONGS_JSON_URL_INTL : MAIMAI_SONGS_JSON_URL;
  return fetchRecordsWithUrl(region, version, url, log);
}

async function fetchRecordsWithUrl(region: Region, version: number, url: string, log: Logger): Promise<SourceChart[]> {
  const response = await fetch(url);
  const data = await response.json();
  const prefixes: [string, SongType, Difficulty][] = [
    ["lev_bas", "std", "basic"],
    ["dx_lev_bas", "dx", "basic"],
    ["lev_adv", "std", "advanced"],
    ["dx_lev_adv", "dx", "advanced"],
    ["lev_exp", "std", "expert"],
    ["dx_lev_exp", "dx", "expert"],
    ["lev_mas", "std", "master"],
    ["dx_lev_mas", "dx", "master"],
    ["lev_remas", "std", "remaster"],
    ["dx_lev_remas", "dx", "remaster"],
    ["lev_utage", "dx", "utage"],
  ];
  const noteTypes = ["tap", "hold", "slide", "touch", "break"];
  return data.flatMap((song: SongsJsonRecord) => {
    const records: SourceChart[] = [];
    const optional = region === "intl" && song.intl === "0";
    const addedDateString = region === "intl" && !!song.date_intl_added ? song.date_intl_added : song.date_added;
    if (!addedDateString) {
      log.warn(`No added date found for song ${song.title} in ${region}`);
      return [];
    }
    const addedDate = parseOtogeDbDate(addedDateString);
    const addedVersion = addedDate ? getVersionFromDate("maimai", region, addedDate) : null;
    for (const [prefix, type, difficulty] of prefixes) {
      if (prefix in song) {
        // Check if all note types are present
        let noteCounts: NoteCounts | undefined = undefined;
        if (noteTypes.every(noteType => !!song[prefix + "_notes_" + noteType as keyof SongsJsonRecord] || (type === "std" && noteType === "touch"))) {
          noteCounts = {
            tap: !!song[prefix + "_notes_tap" as keyof SongsJsonRecord] ? parseInt(song[prefix + "_notes_tap" as keyof SongsJsonRecord] as string) : 0,
            hold: !!song[prefix + "_notes_hold" as keyof SongsJsonRecord] ? parseInt(song[prefix + "_notes_hold" as keyof SongsJsonRecord] as string) : 0,
            slide: !!song[prefix + "_notes_slide" as keyof SongsJsonRecord] ? parseInt(song[prefix + "_notes_slide" as keyof SongsJsonRecord] as string) : 0,
            touch: !!song[prefix + "_notes_touch" as keyof SongsJsonRecord] ? parseInt(song[prefix + "_notes_touch" as keyof SongsJsonRecord] as string) : 0,
            break: !!song[prefix + "_notes_break" as keyof SongsJsonRecord] ? parseInt(song[prefix + "_notes_break" as keyof SongsJsonRecord] as string) : 0,
          };
        }

        const level = song[prefix as keyof SongsJsonRecord]!.replace("?", "")
        records.push(maimaiChart({
          songName: normalizeName(song.title),
          artist: song.artist,
          cover: siteUrl("maimai", region, `img/Music/${song.image_url}`).href,
          difficulty,
          level,
          levelPrecise: parseOtogeDbConstant(song[prefix + "_i" as keyof SongsJsonRecord])
            ?? (difficulty === "utage" ? maimaiLevelPolicy(version).toPrecise(level) : undefined),
          type,
          genre: normalizeGenre(song.catcode),
          addedVersion: addedVersion ?? 0,
          bpm: parseInt(song.bpm) || undefined,
          noteDesigner: song[prefix + "_designer" as keyof SongsJsonRecord] || undefined,
          noteCounts,
          mode: optional ? "only-modify" : undefined,
        }));
      }
    }
    log.debug({ addedDate, addedVersion, optional, region, recordCount: records.length }, `Fetched basic info on otoge-db for ${song.title}`);
    return records;
  });
}
