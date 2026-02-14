import { Region } from "@/lib/types";
import { SongFetcher } from "./level-fetcher";
import { AGENT } from "@/lib/maimai-fetcher";
import { load } from "cheerio";
import { normalizeGenre } from "@/lib/name-utils";
import { type Logger } from "pino";
import pLimit from "p-limit";
import { levelToPrecise } from "@/server/utils/level";
import { value } from "@/server/utils/admin/type";
import { key } from "./fetcher-utils";

export const MaimaiAfterFetcher: SongFetcher = async (context, songs) => {
  const limit = pLimit(5);
  const detailCache: Record<string, Promise<ReturnType<typeof parseSongDetail>>> = {};

  // Fill level precise for utage
  songs = songs.map(song => ({
    ...song,
    levelPrecise: song.difficulty === "utage" ? levelToPrecise(value(song.level), context.version) : song.levelPrecise,
  }));

  const getOrCreateDetail = (
    cookies: string,
    inputName: string,
    inputValue: string
  ): Promise<ReturnType<typeof parseSongDetail>> => {
    const key = `${inputName}:${inputValue}`;

    if (!detailCache[key]) {
      detailCache[key] = limit(async () => {
        const html = await fetchWebsite(
          context.region,
          cookies,
          inputName,
          inputValue,
          context.log,
        );
        return parseSongDetail(html, context.region, context.log);
      });
    }
    return detailCache[key];
  };

  const requiresFetch = songs.flatMap(song => {
    if (song.genre) return [];
    const inputName = song.extras?.["inputName"] as string | undefined;
    const inputValue = song.extras?.["inputValue"] as string | undefined;

    if (!inputName || !inputValue) return [];
    return [{ inputName, inputValue, song }];
  });

  context.log.info(
    { songs: requiresFetch.map(s => key(s.song)) },
    `${requiresFetch.length} songs required fetching officially.`
  );

  if (requiresFetch.length >= 1000) {
    throw new Error("Too many songs to fetch officially");
  }

  const groups = Map.groupBy(requiresFetch, s => `${s.inputName}@${s.inputValue}`);

  const detailPromises = Array.from(groups.entries()).map(async ([mapKey, group]) => {
    const { inputName, inputValue } = group![0];
    const details = await getOrCreateDetail(context.cookies, inputName, inputValue);

    return [mapKey, details] as const;
  });

  const detailsMap = new Map(await Promise.all(detailPromises))

  return songs.map(song => {
    if (song.genre) return song;

    const inputName = song.extras?.["inputName"] as (string | undefined), inputValue = song.extras?.["inputValue"] as (string | undefined)
    if (!inputName || !inputValue) return song;

    const details = detailsMap.get(`${inputName}@${inputValue}`)
    if (!details) return song;

    return {
      ...song,
      cover: details.coverUrl,
      genre: details.genre,
      artist: details.artist,
    }
  })
}

async function fetchWebsite(region: Region, cookies: string, inputName: string, inputValue: string, log: Logger) {
  const params = new URLSearchParams();
  params.append(inputName, inputValue);
  const detailUrl = `https://${region === "intl" ? "maimaidx-eng.com" : "maimaidx.jp"}/maimai-mobile/record/musicDetail/?${params.toString()}`;
  log.debug(`Fetching song detail from: ${detailUrl}`);

  const detailResponse = await fetch(detailUrl, {
    method: "GET",
    headers: {
      "Cookie": cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Referer": `https://${region === "intl" ? "maimaidx-eng.com" : "maimaidx.jp"}/maimai-mobile/`,
    },
    ...{ dispatcher: AGENT },
  });

  log.debug(`Song detail response status: ${detailResponse.status}`);

  if (detailResponse.status !== 200) {
    throw new Error(`Failed to fetch song detail: HTTP ${detailResponse.status}`);
  }

  const detailHtml = await detailResponse.text();
  log.debug(`Song detail fetched successfully, length: ${detailHtml.length} characters`);

  return detailHtml
}

function parseSongDetail(html: string, region: Region, log: Logger): {
  coverUrl: string;
  genre: string;
  artist: string;
} {
  const $ = load(html);

  // Extract cover image URL
  const coverElement = $('.basic_block > img');
  if (coverElement.length === 0) {
    const errorMsg = `Could not find cover image in song detail`;
    log.error({ html }, errorMsg);
    throw new Error(errorMsg);
  }
  const coverSrc = coverElement.attr('src');
  if (!coverSrc) {
    log.error({ html }, "Cover image element found but src attribute is missing");
    throw new Error("Cover image element found but src attribute is missing");
  }
  const coverUrl = coverSrc.startsWith('http') ? coverSrc : `https://${region === "intl" ? "maimaidx-eng.com" : "maimaidx.jp"}${coverSrc}`;

  // Extract genre
  const genreElement = $('.basic_block .blue');
  if (genreElement.length === 0) {
    throw new Error("Could not find genre element in song detail");
  }
  const genre = normalizeGenre(genreElement.text().trim());

  // Extract artist
  const artistElement = $('.basic_block .f_12.break');
  if (artistElement.length === 0) {
    throw new Error("Could not find artist element in song detail");
  }
  const artist = artistElement.text().trim();

  log.debug(`Extracted song detail: cover=${coverUrl}, genre=${genre}, artist=${artist}`);

  return {
    coverUrl,
    genre,
    artist,
  };
}
