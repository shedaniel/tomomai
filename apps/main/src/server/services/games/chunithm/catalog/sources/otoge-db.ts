import "server-only";
import type { Region } from "@/lib/types";
import type { CatalogFetchContext, PendingChart } from "@/server/services/catalog/ingestion/types";
import { codeOf } from "@/lib/games/codes";
import { CHUNITHM_NOTE_KINDS, type ChunithmNoteKind } from "@/lib/games/chunithm/note-counts";
import { getGame, type GameSiteRegion } from "@/lib/games/registry";
import { requireGameSite } from "@/lib/games/sites";
import { versionReleaseInstant } from "@/lib/games/version-table";
import { getCurrentVersion, getVersionFromDate } from "@/lib/games/versions";
import { asFetcher } from "../fetcher";

export const OTOGE_DB_CHUNITHM_ROOT = "https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm";
const SOURCES = {
  jp: `${OTOGE_DB_CHUNITHM_ROOT}/data/music-ex.json`,
  intl: `${OTOGE_DB_CHUNITHM_ROOT}/data/music-ex-intl.json`,
} satisfies Record<GameSiteRegion<"chunithm">, string>;
const ULTIMA = codeOf("chunithm", "difficulty", "ultima");
const STANDARD_CHART_TYPE = codeOf("chunithm", "chartType", "standard");
const CHARTS = [
  { prefix: "lev_bas", difficulty: codeOf("chunithm", "difficulty", "basic") },
  { prefix: "lev_adv", difficulty: codeOf("chunithm", "difficulty", "advanced") },
  { prefix: "lev_exp", difficulty: codeOf("chunithm", "difficulty", "expert") },
  { prefix: "lev_mas", difficulty: codeOf("chunithm", "difficulty", "master") },
  { prefix: "lev_ult", difficulty: ULTIMA },
] as const;

type ChartPrefix = typeof CHARTS[number]["prefix"];
type ChartField = "i" | "notes" | "designer" | "chart_link" | `notes_${ChunithmNoteKind}`;
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

function getOtogeDbSource(region: Region) {
  requireGameSite("chunithm", region);
  return { url: SOURCES[region], version: getCurrentVersion("chunithm", region) };
}

function parseDate(value: string | undefined): Date | undefined {
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = versionReleaseInstant(`${year}/${month}/${day}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseCount(value: string | undefined): number | undefined {
  return value && /^\d+$/.test(value) ? Number(value) : undefined;
}

function normalizeOtogeDbCatalog(songs: SongsJsonRecord[], region: Region, sourceUrl: string): PendingChart[] {
  return songs.flatMap(song => {
    if (song.we_kanji || song.we_star) return [];
    if (region === "intl" ? song.intl === "0" : song.intl === "2") return [];
    const sourceVersion = getGame("chunithm").versions.byName(song.version)?.id;
    return CHARTS.flatMap(({ prefix, difficulty }): PendingChart[] => {
      const level = song[prefix];
      if (!level) return [];
      const updateDate = region === "jp" ? song.date_updated : song.date_intl_updated;
      const useUpdateDate = difficulty === ULTIMA && parseDate(updateDate) !== undefined;
      const addedDateString = useUpdateDate ? updateDate : (region === "jp" ? song.date_added : song.date_intl_added);
      const addedDate = parseDate(addedDateString);
      const constant = song[`${prefix}_i`];
      const noteCounts = Object.fromEntries(CHUNITHM_NOTE_KINDS.flatMap(kind => {
        const count = parseCount(song[`${prefix}_notes_${kind}`]);
        return count === undefined ? [] : [[kind, count]];
      }));
      return [{
        game: "chunithm",
        songName: song.title,
        chartType: STANDARD_CHART_TYPE,
        difficulty,
        artist: song.artist,
        cover: `${OTOGE_DB_CHUNITHM_ROOT}/jacket/${song.image}`,
        genre: song.catname,
        level,
        levelPrecise: constant && constant !== "-" ? Math.round(parseFloat(constant) * 10) : undefined,
        addedVersion: addedDate ? getVersionFromDate("chunithm", region, addedDate, sourceVersion) : undefined,
        bpm: parseCount(song.bpm),
        noteDesigner: song[`${prefix}_designer`] || undefined,
        metadata: {
          levelPreciseEstimated: false,
          addedVersionEstimated: difficulty === ULTIMA && !useUpdateDate,
          otogeDb: {
            id: song.id,
            url: sourceUrl,
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

export const OtogeDbFetcher = asFetcher(async (ctx: CatalogFetchContext): Promise<PendingChart[]> => {
  const source = getOtogeDbSource(ctx.region);
  if (ctx.version !== source.version) {
    throw new Error(`otoge-db CHUNITHM ${ctx.region} catalog only supports version ${source.version}; requested ${ctx.version}`);
  }
  const response = await fetch(source.url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (!response.ok) throw new Error(`otoge-db CHUNITHM catalog request failed: HTTP ${response.status}`);
  const songs: SongsJsonRecord[] = await response.json();
  const charts = normalizeOtogeDbCatalog(songs, ctx.region, source.url);
  if (!charts.length) throw new Error(`otoge-db returned no regular CHUNITHM charts for ${ctx.region}`);
  ctx.log.info({ game: "chunithm", region: ctx.region, recordCount: charts.length }, "Collected otoge-db catalog");
  ctx.notice.addDetail(`${charts.length} regular CHUNITHM charts from ${ctx.region.toUpperCase()} otoge-db; WORLD'S END excluded`);
  return charts;
});
