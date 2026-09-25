import { z } from "zod";
import type { Region } from "@/lib/types";
import type { CatalogFetchContext, PendingChart } from "../../ingestion/types";
import { GameAdapterError } from "@/lib/games/types";
import { CHUNITHM_VERSIONS, ChunithmVersions, chunithmVersionProvider } from "@/lib/games/adapters/chunithm/versions";

const SOURCE_ROOT = "https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm";
const VERSION_METADATA_URL = "https://raw.githubusercontent.com/zvuc/otoge-db/main/scripts/chunithm/game.py";
const SOURCES = {
  jp: { url: `${SOURCE_ROOT}/data/music-ex.json`, version: ChunithmVersions.CHUNITHM_MATE.id },
  intl: { url: `${SOURCE_ROOT}/data/music-ex-intl.json`, version: ChunithmVersions.CHUNITHM_X_VERSE_X.id },
};

const CHARTS = [
  { prefix: "lev_bas", difficulty: 0 },
  { prefix: "lev_adv", difficulty: 1 },
  { prefix: "lev_exp", difficulty: 2 },
  { prefix: "lev_mas", difficulty: 3 },
  { prefix: "lev_ult", difficulty: 4 },
] as const;

const songSchema = z.object({
  id: z.string().regex(/^\d+$/),
  title: z.string().min(1),
  artist: z.string(),
  reading: z.string(),
  catname: z.string().min(1),
  image: z.string().regex(/^[a-zA-Z0-9_-]+\.(?:jpg|png)$/),
  version: z.string().min(1),
  intl: z.enum(["0", "1", "2"]),
  date_added: z.string(),
  date_updated: z.string().optional(),
  date_intl_added: z.string().optional(),
  date_intl_updated: z.string().optional(),
  lev_bas: z.string(),
  lev_adv: z.string(),
  lev_exp: z.string(),
  lev_mas: z.string(),
  lev_ult: z.string(),
  we_kanji: z.string(),
  we_star: z.string(),
  bpm: z.string(),
}).catchall(z.string());

const catalogSchema = z.array(songSchema).min(1);
const sourceVersions = new Map<string, number>(CHUNITHM_VERSIONS.map(version => [version.shortName, version.id]));
sourceVersions.set("無印", ChunithmVersions.CHUNITHM.id);
sourceVersions.set("PARADISE×", ChunithmVersions.CHUNITHM_PARADISE_LOST.id);

export function getOtogeDbSource(region: Region) {
  if (region !== "jp" && region !== "intl") {
    throw new GameAdapterError("UNSUPPORTED_REGION", "otoge-db CHUNITHM catalog supports JP and International only", "chunithm", region, "catalog");
  }
  return SOURCES[region];
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value || /^0+$/.test(value)) return undefined;
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid otoge-db CHUNITHM release date: ${value}`);
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T07:00:00+09:00`);
  if (Number.isNaN(date.getTime()) || date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).replaceAll("-", "") !== value) {
    throw new Error(`Invalid otoge-db CHUNITHM release date: ${value}`);
  }
  return date;
}

function versionAtDate(value: string | undefined, region: Region, sourceVersion: number): { version: number; estimated: boolean } {
  const date = parseDate(value);
  if (!date) throw new Error(`Missing otoge-db CHUNITHM ${region} release date`);
  const released = chunithmVersionProvider.getAvailableVersions(region)
    .filter(version => date >= new Date(`${version.releaseDate.replaceAll("/", "-")}T07:00:00+09:00`))
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  const latestDate = released[0]?.releaseDate;
  const candidates = released.filter(version => version.releaseDate === latestDate);
  if (candidates.length === 1) return { version: candidates[0].id, estimated: false };
  if (candidates.some(version => version.id === sourceVersion)) return { version: sourceVersion, estimated: true };
  throw new Error(`Cannot resolve otoge-db CHUNITHM ${region} release version for ${value}`);
}

function parseConstant(value: string | undefined, sourceId: string, prefix: string): number | undefined {
  if (!value || value === "-") return undefined;
  if (!/^\d{1,2}(?:\.\d)?$/.test(value) || Number(value) <= 0) {
    throw new Error(`Invalid otoge-db CHUNITHM constant for ${sourceId}/${prefix}: ${value}`);
  }
  return Math.round(Number(value) * 10);
}

function parseCount(value: string | undefined): number | undefined {
  return value && /^\d+$/.test(value) ? Number(value) : undefined;
}

export function validateOtogeDbVersionMetadata(metadata: string, region: Region, version: number): void {
  getOtogeDbSource(region);
  const field = region === "jp" ? "CURRENT_JP_VER" : "CURRENT_INTL_VER";
  const name = new RegExp(`^${field}\\s*=\\s*["']([^"']+)["']\\s*$`, "m").exec(metadata)?.[1];
  if (!name || sourceVersions.get(name) !== version) {
    throw new Error(`otoge-db CHUNITHM ${region} source version ${name ?? "unknown"} does not match configured version ${version}`);
  }
}

export function normalizeOtogeDbCatalog(data: unknown, region: Region): PendingChart[] {
  const source = getOtogeDbSource(region);
  const songs = catalogSchema.parse(data);
  const charts: PendingChart[] = [];
  const ids = new Set<string>();
  const titles = new Set<string>();

  for (const song of songs) {
    if (song.we_kanji || song.we_star) continue;
    if (region === "intl" ? song.intl === "0" : song.intl === "2") continue;
    if (ids.has(song.id) || titles.has(song.title)) {
      throw new Error(`Ambiguous otoge-db CHUNITHM song identity: ${song.id}/${song.title}`);
    }
    ids.add(song.id);
    titles.add(song.title);

    const sourceVersion = sourceVersions.get(song.version);
    if (sourceVersion === undefined) {
      throw new Error(`Unknown otoge-db CHUNITHM version: ${song.version}`);
    }
    for (const key of Object.keys(song)) {
      const prefix = /^lev_[a-z]+/.exec(key)?.[0];
      if (prefix && prefix !== "lev_we" && !CHARTS.some(chart => chart.prefix === prefix)) {
        throw new Error(`Unknown otoge-db CHUNITHM difficulty: ${prefix}`);
      }
    }
    for (const value of [song.date_added, song.date_updated, song.date_intl_added, song.date_intl_updated]) parseDate(value);

    for (const { prefix, difficulty } of CHARTS) {
      const level = song[prefix];
      if (!level) continue;
      if (!/^\d{1,2}\+?$/.test(level) || Number.parseInt(level) <= 0) {
        throw new Error(`Invalid otoge-db CHUNITHM level for ${song.id}/${prefix}: ${level}`);
      }
      const updateDate = region === "jp" ? song.date_updated : song.date_intl_updated;
      const useUpdateDate = difficulty === 4 && parseDate(updateDate) !== undefined;
      const addedDate = useUpdateDate ? updateDate : (region === "jp" ? song.date_added : song.date_intl_added);
      const release = versionAtDate(addedDate, region, sourceVersion);
      const noteCounts = Object.fromEntries(["tap", "hold", "slide", "air", "flick"]
        .flatMap(kind => {
          const count = parseCount(song[`${prefix}_notes_${kind}`]);
          return count === undefined ? [] : [[kind, count]];
        }));
      charts.push({
        game: "chunithm",
        songName: song.title,
        chartType: 0,
        difficulty,
        artist: song.artist,
        cover: `${SOURCE_ROOT}/jacket/${song.image}`,
        genre: song.catname,
        level,
        levelPrecise: parseConstant(song[`${prefix}_i`], song.id, prefix),
        addedVersion: release.version,
        bpm: parseCount(song.bpm),
        noteDesigner: song[`${prefix}_designer`] || undefined,
        metadata: {
          levelPreciseEstimated: false,
          addedVersionEstimated: release.estimated || (difficulty === 4 && !useUpdateDate),
          otogeDb: {
            id: song.id,
            url: source.url,
            version: song.version,
            reading: song.reading,
            dateAdded: song.date_added,
            dateUpdated: song.date_updated,
            dateIntlAdded: song.date_intl_added,
            dateIntlUpdated: song.date_intl_updated,
            chartAddedDate: addedDate,
            chartAddedDateSource: useUpdateDate ? "regional-update" : "regional-song",
            constant: song[`${prefix}_i`] || undefined,
            bpm: song.bpm,
            totalNotes: parseCount(song[`${prefix}_notes`]),
            noteCounts,
            chartLink: song[`${prefix}_chart_link`] || undefined,
          },
        },
      });
    }
  }
  if (!charts.length) throw new Error(`otoge-db returned no regular CHUNITHM charts for ${region}`);
  return charts;
}

export async function fetchOtogeDbCatalog(ctx: CatalogFetchContext): Promise<PendingChart[]> {
  const source = getOtogeDbSource(ctx.region);
  if (ctx.version !== source.version) {
    throw new Error(`otoge-db CHUNITHM ${ctx.region} catalog only supports version ${source.version}; requested ${ctx.version}`);
  }
  const responses = await Promise.all([source.url, VERSION_METADATA_URL].map(async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (!response.ok) throw new Error(`otoge-db CHUNITHM catalog request failed: HTTP ${response.status}`);
    return response;
  }));
  const [response, versionMetadata] = responses;
  validateOtogeDbVersionMetadata(await versionMetadata.text(), ctx.region, ctx.version);
  const charts = normalizeOtogeDbCatalog(await response.json(), ctx.region);
  ctx.log.info({ game: "chunithm", region: ctx.region, recordCount: charts.length }, "Collected otoge-db catalog");
  ctx.notice.addDetail(`${charts.length} regular CHUNITHM charts from ${ctx.region.toUpperCase()} otoge-db; WORLD'S END excluded`);
  return charts;
}
