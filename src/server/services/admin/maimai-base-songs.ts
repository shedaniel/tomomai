import { Difficulty, Level, Region, SongType } from "@/lib/types";
import { OfficialSong } from "@/lib/types/update";
import { asFetcher } from "./fetcher-utils";
import { maimaiBaseUrl } from "@/lib/maimai/http";
import { normalizeGenre, normalizeName } from "@/lib/name-utils";
import { important, PendingSong } from "@/server/utils/admin/type";
import { getVersionByShortCode } from "@/lib/metadata";

const MAIMAI_SONGS_JSON_URL = "https://maimai.sega.jp/data/maimai_songs.json";
const MAIMAI_SONGS_JSON_URL_INTL = "https://maimai.sega.com/assets/data/maimai_songs.json";

export const MaimaiBaseFetcher = asFetcher(async ({ region, version, cookies, notice }) => {
  const map = [
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
      ? `${maimaiBaseUrl(region)}/maimai-mobile/img/Music/${song.image_url}`
      : "https://maimaidx.jp/maimai-mobile/img/Music/default.png";
    const genre = normalizeGenre(song?.catcode || "Unknown");

    const charts = [] as PendingSong[]
    for (const [fieldName, difficulty, type] of map) {
      if (!!(song as any)[fieldName]) {
        charts.push({
          songName: normalizeName(song.title),
          type: type as SongType,
          difficulty: difficulty as Difficulty,
          level: important(((song as any)[fieldName] as string).replace("?", "") as Level),
          cover,
          genre: important(genre),
          artist: important(song.artist),
          addedVersion: getVersionByShortCode(song.version)?.id,
        } satisfies PendingSong);
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
