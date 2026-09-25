import type { Region } from "@/lib/types";
import type { CatalogFetchContext, PendingChart } from "../../ingestion/types";
import { GameAdapterError } from "@/lib/games/types";
import { getVersionFromDate } from "@/lib/games/versions";
import { getChunithmVersionByName, chunithmVersionProvider } from "@/lib/games/adapters/chunithm/versions";

const SOURCE_ROOT = "https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm";
const SOURCES = {
  jp: `${SOURCE_ROOT}/data/music-ex.json`,
  intl: `${SOURCE_ROOT}/data/music-ex-intl.json`,
};
const CHARTS = [
  { prefix: "lev_bas", difficulty: 0 },
  { prefix: "lev_adv", difficulty: 1 },
  { prefix: "lev_exp", difficulty: 2 },
  { prefix: "lev_mas", difficulty: 3 },
  { prefix: "lev_ult", difficulty: 4 },
] as const;

type ChartPrefix = typeof CHARTS[number]["prefix"];
type ChartField = "i" | "notes" | "designer" | "chart_link" | `notes_${"tap" | "hold" | "slide" | "air" | "flick"}`;
type SongsJsonRecord = {
  id: string;
  title: string;
  artist: string;
  reading: string;
  catname: string;
  image: string;
  version: string;
  intl: string;
  date_added: string;
  date_updated?: string;
  date_intl_added?: string;
  date_intl_updated?: string;
  we_kanji: string;
  we_star: string;
  bpm: string;
} & Partial<Record<ChartPrefix | `${ChartPrefix}_${ChartField}`, string>>;

export function getOtogeDbSource(region: Region) {
  if (region !== "jp" && region !== "intl") {
    throw new GameAdapterError("UNSUPPORTED_REGION", "otoge-db CHUNITHM catalog supports JP and International only", "chunithm", region, "catalog");
  }
  return { url: SOURCES[region], version: chunithmVersionProvider.getCurrentVersion(region) };
}

function parseDate(value: string | undefined): Date | undefined {
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T07:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseCount(value: string | undefined): number | undefined {
  return value && /^\d+$/.test(value) ? Number(value) : undefined;
}

export function normalizeOtogeDbCatalog(songs: SongsJsonRecord[], region: Region): PendingChart[] {
  const source = getOtogeDbSource(region);
  return songs.flatMap(song => {
    if (song.we_kanji || song.we_star) return [];
    if (region === "intl" ? song.intl === "0" : song.intl === "2") return [];
    const sourceVersion = getChunithmVersionByName("jp", song.version)?.id;
    return CHARTS.flatMap(({ prefix, difficulty }): PendingChart[] => {
      const level = song[prefix];
      if (!level) return [];
      const updateDate = region === "jp" ? song.date_updated : song.date_intl_updated;
      const useUpdateDate = difficulty === 4 && parseDate(updateDate) !== undefined;
      const addedDateString = useUpdateDate ? updateDate : (region === "jp" ? song.date_added : song.date_intl_added);
      const addedDate = parseDate(addedDateString);
      const constant = song[`${prefix}_i`];
      const noteCounts = Object.fromEntries((["tap", "hold", "slide", "air", "flick"] as const).flatMap(kind => {
        const count = parseCount(song[`${prefix}_notes_${kind}`]);
        return count === undefined ? [] : [[kind, count]];
      }));
      return [{
        game: "chunithm",
        songName: song.title,
        chartType: 0,
        difficulty,
        artist: song.artist,
        cover: `${SOURCE_ROOT}/jacket/${song.image}`,
        genre: song.catname,
        level,
        levelPrecise: constant && constant !== "-" ? Math.round(parseFloat(constant) * 10) : undefined,
        addedVersion: addedDate ? getVersionFromDate("chunithm", region, addedDate, sourceVersion) : undefined,
        bpm: parseCount(song.bpm),
        noteDesigner: song[`${prefix}_designer`] || undefined,
        metadata: {
          levelPreciseEstimated: false,
          addedVersionEstimated: difficulty === 4 && !useUpdateDate,
          otogeDb: {
            id: song.id,
            url: source.url,
            version: song.version,
            reading: song.reading,
            dateAdded: song.date_added,
            dateUpdated: song.date_updated,
            dateIntlAdded: song.date_intl_added,
            dateIntlUpdated: song.date_intl_updated,
            chartAddedDate: addedDateString,
            chartAddedDateSource: useUpdateDate ? "regional-update" : "regional-song",
            constant: constant || undefined,
            bpm: song.bpm,
            totalNotes: parseCount(song[`${prefix}_notes`]),
            noteCounts,
            chartLink: song[`${prefix}_chart_link`] || undefined,
          },
        },
      }];
    });
  });
}

export async function fetchOtogeDbCatalog(ctx: CatalogFetchContext): Promise<PendingChart[]> {
  const source = getOtogeDbSource(ctx.region);
  if (ctx.version !== source.version) {
    throw new Error(`otoge-db CHUNITHM ${ctx.region} catalog only supports version ${source.version}; requested ${ctx.version}`);
  }
  const response = await fetch(source.url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (!response.ok) throw new Error(`otoge-db CHUNITHM catalog request failed: HTTP ${response.status}`);
  const songs: SongsJsonRecord[] = await response.json();
  const charts = normalizeOtogeDbCatalog(songs, ctx.region);
  if (!charts.length) throw new Error(`otoge-db returned no regular CHUNITHM charts for ${ctx.region}`);
  ctx.log.info({ game: "chunithm", region: ctx.region, recordCount: charts.length }, "Collected otoge-db catalog");
  ctx.notice.addDetail(`${charts.length} regular CHUNITHM charts from ${ctx.region.toUpperCase()} otoge-db; WORLD'S END excluded`);
  return charts;
}
