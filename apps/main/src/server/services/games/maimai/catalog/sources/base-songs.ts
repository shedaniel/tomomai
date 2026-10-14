import "server-only";
import type { Region } from "@/lib/games/ids";
import type { Difficulty, SongType } from "@/lib/games/maimai/types";
import { asCatalogFetcher } from "@/server/services/catalog/ingestion/merge";
import { siteUrl } from "@/lib/games/sites";
import { normalizeName } from "@/lib/name-utils";
import { normalizeGenre } from "../genres";
import { important, type SourceChart } from "@/server/services/catalog/ingestion/types";
import { getVersionByShortCode } from "@/lib/games/maimai/versions";
import { maimaiChart } from "../chart";

type OfficialSong = {
  artist: string;
  catcode: string;
  image_url: string;
  release: string;
  lev_bas?: string;
  lev_adv?: string;
  lev_exp?: string;
  lev_mas?: string;
  lev_remas?: string;
  lev_utage?: string;
  dx_lev_bas?: string;
  dx_lev_adv?: string;
  dx_lev_exp?: string;
  dx_lev_mas?: string;
  dx_lev_remas?: string;
  dx_lev_utage?: string;
  sort: string;
  title: string;
  title_kana: string;
  version: string;
};

const MAIMAI_SONGS_JSON_URL = "https://maimai.sega.jp/data/maimai_songs.json";
const MAIMAI_SONGS_JSON_URL_INTL = "https://maimai.sega.com/assets/data/maimai_songs.json";

export const MaimaiBaseFetcher = asCatalogFetcher(async ({ region, notice }) => {
  const map: [keyof OfficialSong & `${string}lev_${string}`, Difficulty, SongType][] = [
    ["lev_bas", "basic", "std"],
    ["lev_adv", "advanced", "std"],
    ["lev_exp", "expert", "std"],
    ["lev_mas", "master", "std"],
    ["lev_remas", "remaster", "std"],
    ["lev_utage", "utage", "dx"],
    ["dx_lev_bas", "basic", "dx"],
    ["dx_lev_adv", "advanced", "dx"],
    ["dx_lev_exp", "expert", "dx"],
    ["dx_lev_mas", "master", "dx"],
    ["dx_lev_remas", "remaster", "dx"],
    ["dx_lev_utage", "utage", "dx"],
  ]
  const parsedSongs = await fetchBaseSongs(region);
  notice.addDetail(`Fetched ${parsedSongs.length} songs from official JSON`);
  return parsedSongs.flatMap(song => {
    const cover = song?.image_url
      ? siteUrl("maimai", region, `img/Music/${song.image_url}`).href
      : "https://maimaidx.jp/maimai-mobile/img/Music/default.png";
    const genre = normalizeGenre(song?.catcode || "Unknown");

    const charts: SourceChart[] = [];
    for (const [fieldName, difficulty, type] of map) {
      const level = song[fieldName];
      if (level) {
        charts.push(maimaiChart({
          songName: normalizeName(song.title),
          type,
          difficulty,
          level: important(level.replace("?", "")),
          cover,
          genre: important(genre),
          artist: important(song.artist),
          addedVersion: getVersionByShortCode(song.version)?.id,
        }));
      }
    }
    return charts;
  });
});

export async function fetchBaseSongs(region: Region): Promise<OfficialSong[]> {
  const songsJsonResponse = await fetch(region === "intl" ? MAIMAI_SONGS_JSON_URL_INTL : MAIMAI_SONGS_JSON_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  });

  if (songsJsonResponse.status !== 200) {
    throw new Error(`Failed to fetch maimai songs JSON: HTTP ${songsJsonResponse.status}`);
  }

  return await songsJsonResponse.json();
}
