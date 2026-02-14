import { getVersionFromDate, VersionId, Versions } from "@/lib/metadata";
import { normalizeGenre, normalizeName } from "@/lib/name-utils";
import { Difficulty, Level, NoteCounts, Region, SongType } from "@/lib/types";
import { PendingSong } from "@/server/utils/admin/type";
import { asFetcher } from "./fetcher-utils";
import { key, SongWithMode } from "./fetcher-utils";
import { Logger } from "pino";
import { levelToPrecise } from "@/server/utils/level";

const MAIMAI_SONGS_JSON_URL = "https://github.com/zvuc/otoge-db/raw/refs/heads/master/maimai/data/music-ex.json";
const MAIMAI_SONGS_JSON_URL_INTL = "https://github.com/zvuc/otoge-db/raw/refs/heads/master/maimai/data/music-ex-intl.json";

const JP_FALLBACK_FOR_INTL: Partial<Record<VersionId, string>> = {
  [Versions.MAIMAI_DX_PRISM.id]: "https://github.com/zvuc/otoge-db/raw/refs/heads/master/maimai/data/music-ex-prism-final.json",
  [Versions.MAIMAI_DX_PRISM_PLUS.id]: "https://github.com/zvuc/otoge-db/raw/refs/heads/master/maimai/data/music-ex-prismplus-final.json",
  [Versions.MAIMAI_DX_CIRCLE.id]: MAIMAI_SONGS_JSON_URL,
}

export const OtogeDbFetcher = asFetcher(async (context) => {
  let allRecords: SongWithMode[] = []
  if (context.region === "jp") {
    allRecords = await fetchRecords(context.region, context.version, context.log);
  } else {
    const jpRecordsLink = JP_FALLBACK_FOR_INTL[context.version]
    const [jpRecords, intlRecords] = await Promise.all([
      jpRecordsLink ? fetchRecordsWithUrl("jp", context.version, jpRecordsLink, context.log) : Promise.resolve([]),
      fetchRecords("intl", context.version, context.log),
    ]);

    const applyJpFallback = (record: SongWithMode) => {
      const jpRecord = jpRecords.find(r => r.songName === record.songName && r.difficulty === record.difficulty && r.type === record.type);
      if (!jpRecord) {
        return record;
      }
      return {
        ...jpRecord,
        ...record,
        ...Object.fromEntries(Object.entries(jpRecord).filter(([key]) => record[key as keyof PendingSong] === null)),
      } as SongWithMode;
    };

    // set of both, with intl records taking precedence, the unique key should be songName-difficulty-type
    allRecords = intlRecords.map(record => applyJpFallback(record));
    // songs that are in the otoge jp db but not in otoge intl db might be already in the db, we just modify them
    allRecords.push(...jpRecords.filter(record => !intlRecords.some(r => r.songName === record.songName && r.difficulty === record.difficulty && r.type === record.type))
      .map(r => ({
        ...r,
        mode: "only-modify",
      } satisfies SongWithMode)));
    for (const song of allRecords) {
      context.log.trace({ song }, `Song ${key(song)} has been processed for otoge-db`);
    }
  }

  context.log.trace({ songs: allRecords.map(key) }, "Fetched records from otoge-db")

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

async function fetchRecords(region: Region, version: VersionId, log: Logger): Promise<SongWithMode[]> {
  const url = region === "intl" ? MAIMAI_SONGS_JSON_URL_INTL : MAIMAI_SONGS_JSON_URL;
  return fetchRecordsWithUrl(region, version, url, log);
}

async function fetchRecordsWithUrl(region: Region, version: VersionId, url: string, log: Logger): Promise<SongWithMode[]> {
  const response = await fetch(url);
  const data = await response.json();
  const prefixes = [
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
  function parseDate(date: string): Date | null {
    // format of YYYYMMDD
    const match = date.match(/(\d{4})(\d{2})(\d{2})/);
    if (!match) {
      return null;
    }
    const [, year, month, day] = match;
    // Create ISO 8601 string with JST timezone offset (+09:00)
    // This ensures the date is interpreted as JST midnight regardless of server timezone
    return new Date(`${year}-${month}-${day}T00:00:00+09:00`);
  }
  return data.flatMap((song: SongsJsonRecord) => {
    const records: SongWithMode[] = [];
    const optional = region === "intl" && song.intl === "0";
    const addedDateString = region === "intl" && !!song.date_intl_added ? song.date_intl_added : song.date_added;
    if (!addedDateString) {
      log.warn(`No added date found for song ${song.title} in ${region}`);
      return [];
    }
    const addedDate = parseDate(addedDateString);
    const addedVersion = addedDate ? getVersionFromDate(addedDate, region) : null;
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

        const level = song[prefix as keyof SongsJsonRecord]!.replace("?", "") as Level

        records.push({
          songName: normalizeName(song.title),
          artist: song.artist,
          cover: region === "intl" ? `https://maimaidx-eng.com/maimai-mobile/img/Music/${song.image_url}` : `https://maimaidx.jp/maimai-mobile/img/Music/${song.image_url}`,
          difficulty: difficulty as Difficulty,
          level,
          levelPrecise: !!song[prefix + "_i" as keyof SongsJsonRecord] ? Math.round(parseFloat(song[prefix + "_i" as keyof SongsJsonRecord] as string) * 10) : difficulty === "utage" ? levelToPrecise(level, version) : undefined,
          type: type as SongType,
          genre: normalizeGenre(song.catcode),
          addedVersion: addedVersion ?? 0,
          bpm: !!song.bpm ? parseInt(song.bpm) : undefined,
          noteDesigner: song[prefix + "_designer" as keyof SongsJsonRecord] ?? undefined,
          noteCounts,
          mode: optional ? "only-modify" : undefined,
        } satisfies SongWithMode);
      }
    }
    log.debug({ song, addedDate, addedVersion, optional, records, region }, `Fetched basic info on otoge-db for ${song.title}`);
    return records;
  });
}
