import { logger } from "@/lib/logger";
import { AGENT } from "@/lib/maimai-fetcher";
import { getCurrentVersion, getVersionInfo, VersionId } from "@/lib/metadata";
import { normalizeGenre, normalizeName } from "@/lib/name-utils";
import { Difficulty, Level, NoteCounts, Region, SongType } from "@/lib/types";
import { DxRatingResponse } from "@/lib/types/dxrating";
import { OfficialSong, ParsedSong, UpdateSong } from "@/lib/types/update";
import { awaitWrapper, sortKeys } from "@/lib/utils";
import { fetchDxDataJson } from "@/server/services/admin/dxrating";
import { fetchBaseSongs } from "@/server/services/admin/maimai-base-songs";
import { login } from "@/server/services/admin/maimai-login";
import { levelToPrecise } from "@/server/utils/level";
import { load } from "cheerio";
import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { join } from "path";

// Helper function to get internal level value from dxdata.json
function getInternalLevelFromDxData(
  songTitle: string,
  type: SongType,
  difficulty: Difficulty,
  region: Region,
  dxData: DxRatingResponse
): number | null {
  // Find the song by title
  const song = dxData.songs.find(s => normalizeName(s.title) === songTitle);
  if (!song) {
    return null;
  }

  // Find the sheet by type and difficulty
  const sheet = song.sheets.find(s => s.type === type && s.difficulty === difficulty);
  if (!sheet) {
    return null;
  }

  // Get current version info for the region
  const currentVersionId = getCurrentVersion(region);
  const currentVersionInfo = getVersionInfo(currentVersionId);
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

// Helper function to get precise level value (tries dxdata first, falls back to levelToPrecise)
function getPreciseLevelValue(
  songTitle: string,
  level: string,
  type: SongType,
  difficulty: Difficulty,
  region: Region,
  version: VersionId,
  dxData: DxRatingResponse
): number {
  // Try to get from dxdata.json first
  const dxDataLevel = getInternalLevelFromDxData(songTitle, type, difficulty, region, dxData);
  if (dxDataLevel !== null) {
    console.log(`Using dxdata internal level for ${songTitle} (${type}/${difficulty}): ${dxDataLevel / 10}`);
    return dxDataLevel;
  }

  // Fallback to original levelToPrecise logic
  console.log(`Using fallback level calculation for ${songTitle} (${type}/${difficulty}): ${level}`);
  return levelToPrecise(level, version);
}

function getExtraDataFromDxData(
  songTitle: string,
  type: SongType,
  difficulty: Difficulty,
  dxData: DxRatingResponse
): {
  bpm: number | null;
  noteDesigner: string | null;
  noteCounts: NoteCounts | null;
} {
  let bpm: number | null = null;
  let noteDesigner: string | null = null;
  let noteCounts: NoteCounts | null = null;

  const song = dxData.songs.find(s => normalizeName(s.title) === songTitle);
  if (song) {
    bpm = song.bpm;

    const sheet = song.sheets.find(s => s.type === type && s.difficulty === difficulty);
    if (sheet) {
      if (sheet.noteDesigner !== "-") {
        noteDesigner = sheet.noteDesigner;
      }
      if (sheet.noteCounts) {
        noteCounts = sheet.noteCounts;
      }
    }
  }

  return {
    bpm: bpm ?? null,
    noteDesigner: noteDesigner ?? null,
    noteCounts: noteCounts ?? null,
  }
}

// Helper function to get cookies from redirect URL
async function getCookiesFromRedirect(redirectUrl: string, redirectCookies: string | null): Promise<string> {
  console.log(`Fetching redirect URL to get login cookies: ${redirectUrl}`);

  const loginResponse = await fetch(redirectUrl, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      ...(redirectCookies ? { "Cookie": redirectCookies } : {}),
    },
    redirect: "manual", // Don't follow redirects,
    ...{ dispatcher: AGENT },
  });

  console.log(`Login response status: ${loginResponse.status}`);

  // Extract Set-Cookie headers
  let setCookieHeaders: string[] = [];
  if (loginResponse.headers.getSetCookie) {
    setCookieHeaders = loginResponse.headers.getSetCookie();
  } else {
    // Fallback for environments that don't support getSetCookie()
    const cookieHeader = loginResponse.headers.get('set-cookie');
    if (cookieHeader) {
      setCookieHeaders = [cookieHeader];
    }
  }

  if (setCookieHeaders.length === 0) {
    throw new Error("No cookies received from login redirect");
  }

  console.log(`Received ${setCookieHeaders.length} cookies from login`);

  // Parse cookies into a single Cookie header value
  const cookies = setCookieHeaders.map(header => {
    // Extract just the name=value part (before first semicolon)
    const cookiePart = header.split(';')[0];
    return cookiePart;
  }).join('; ');

  console.log(`Parsed cookies for song data request`);
  return cookies;
}

// Helper function to fetch and parse song data for a specific difficulty and version
async function fetchSongDataForDifficulty(region: Region, cookies: string, difficulty: number, version: number): Promise<ParsedSong[]> {
  const songsUrl = `https://${region === "intl" ? "maimaidx-eng.com" : "maimaidx.jp"}/maimai-mobile/record/musicVersion/search/?version=${version}&diff=${difficulty}`;
  console.log(`Fetching songs data for version ${version}, difficulty ${difficulty} from: ${songsUrl}`);

  const songsResponse = await fetch(songsUrl, {
    method: "GET",
    headers: {
      "Cookie": cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Referer": `https://${region === "intl" ? "maimaidx-eng.com" : "maimaidx.jp"}/maimai-mobile/`,
    },
    ...{ dispatcher: AGENT },
  });

  console.log(`Songs data response status for version ${version}, difficulty ${difficulty}: ${songsResponse.status}`);

  if (songsResponse.status !== 200) {
    throw new Error(`Failed to fetch songs data for version ${version}, difficulty ${difficulty}: HTTP ${songsResponse.status}`);
  }

  const songsHtml = await songsResponse.text();
  console.log(`Songs data for version ${version}, difficulty ${difficulty} fetched successfully, length: ${songsHtml.length} characters`);

  return parseSongData(songsHtml, difficulty, version);
}

// Helper function to parse song data from HTML
function parseSongData(html: string, difficulty: number, version: number): ParsedSong[] {
  const $ = load(html);

  // Use correct selector based on difficulty
  const difficultySelectors = [
    ".music_basic_score_back",      // difficulty 0
    ".music_advanced_score_back",   // difficulty 1
    ".music_expert_score_back",     // difficulty 2
    ".music_master_score_back",     // difficulty 3
    ".music_remaster_score_back"    // difficulty 4
  ];

  const selector = difficultySelectors[difficulty];
  if (!selector) {
    logger.error({ difficulty }, "Invalid difficulty in parseSongData");
    return [];
  }

  const blocks = $(selector);
  const songs: ParsedSong[] = [];

  console.log(`Found ${blocks.length} song blocks for difficulty ${difficulty} using selector ${selector}`);

  blocks.each((index, element) => {
    try {
      const block = $(element);
      const parent = block.parent();

      // Extract music type (dx/std) from icon image
      const iconElement = parent.find('img.music_kind_icon');
      if (iconElement.length === 0) {
        console.warn(`No music kind icon found for block ${index}`);
        return; // Skip this block
      }

      const iconSrc = iconElement.attr('src');
      if (!iconSrc) {
        console.warn(`No src attribute found for music kind icon in block ${index}`);
        return; // Skip this block
      }

      let musicType: SongType;
      if (iconSrc.includes('music_dx.png')) {
        musicType = "dx";
      } else if (iconSrc.includes('music_standard.png')) {
        musicType = "std";
      } else {
        console.warn(`Unknown music type icon: ${iconSrc} in block ${index}`);
        return; // Skip this block
      }

      // Extract song name
      const nameElement = block.find('.music_name_block');
      if (nameElement.length === 0) {
        console.warn(`No music name block found for block ${index}`);
        return; // Skip this block
      }
      const songName = normalizeName(nameElement.text().trim());

      // Extract level
      const levelElement = block.find('.music_lv_block');
      if (levelElement.length === 0) {
        console.warn(`No music level block found for block ${index}`);
        return; // Skip this block
      }
      const level = levelElement.text().trim();

      // Extract input value and name
      const inputElement = block.find('input');
      if (inputElement.length === 0) {
        console.warn(`No input element found for block ${index}`);
        return; // Skip this block
      }
      const inputValue = inputElement.attr('value');
      const inputName = inputElement.attr('name');

      if (!inputValue || !inputName) {
        console.warn(`Input element missing value or name attribute in block ${index}`);
        return; // Skip this block
      }

      // Map difficulty number to difficulty name
      const difficultyNames = ["basic", "advanced", "expert", "master", "remaster"];
      const difficultyName = difficultyNames[difficulty] || "unknown";

      const songData = {
        songName,
        level: level as Level,
        musicType,
        difficulty: difficultyName,
        inputValue,
        inputName,
        difficultyNumber: difficulty,
        version,
        index,
      };

      songs.push(songData);

      console.log(`Extracted song ${index}: ${songName} (${level}, ${musicType}, ${difficultyName})`);
    } catch (error) {
      logger.error({ error, index }, "Error processing song block");
    }
  });

  console.log(`Successfully extracted ${songs.length} songs for difficulty ${difficulty}`);
  return songs;
}

// Helper function to fetch detailed song information
async function fetchSongDetail(region: Region, cookies: string, inputName: string, inputValue: string): Promise<ReturnType<typeof parseSongDetail>> {
  const params = new URLSearchParams();
  params.append(inputName, inputValue);
  const detailUrl = `https://${region === "intl" ? "maimaidx-eng.com" : "maimaidx.jp"}/maimai-mobile/record/musicDetail/?${params.toString()}`;
  console.log(`Fetching song detail from: ${detailUrl}`);

  const detailResponse = await fetch(detailUrl, {
    method: "GET",
    headers: {
      "Cookie": cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Referer": `https://${region === "intl" ? "maimaidx-eng.com" : "maimaidx.jp"}/maimai-mobile/`,
    },
    ...{ dispatcher: AGENT },
  });

  console.log(`Song detail response status: ${detailResponse.status}`);

  if (detailResponse.status !== 200) {
    throw new Error(`Failed to fetch song detail: HTTP ${detailResponse.status}`);
  }

  const detailHtml = await detailResponse.text();
  console.log(`Song detail fetched successfully, length: ${detailHtml.length} characters`);

  return parseSongDetail(detailHtml, region);
}

// Helper function to parse detailed song information from HTML
function parseSongDetail(html: string, region: Region): {
  coverUrl: string;
  genre: string;
  artist: string;
} {
  const $ = load(html);

  // Extract cover image URL
  const coverElement = $('.basic_block > img');
  if (coverElement.length === 0) {
    throw new Error("Could not find cover image in song detail");
  }
  const coverSrc = coverElement.attr('src');
  if (!coverSrc) {
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

  console.log(`Extracted song detail: cover=${coverUrl}, genre=${genre}, artist=${artist}`);

  return {
    coverUrl,
    genre,
    artist,
  };
}

// Helper function to prepare song entries from scraped difficulty data
function prepareSongEntriesFromScrapedData(difficulties: ParsedSong[], jsonSong: OfficialSong | undefined, region: Region, dxData: DxRatingResponse): UpdateSong[] {
  const difficultyNames = ["basic", "advanced", "expert", "master", "remaster"];
  const records: UpdateSong[] = [];

  // Get common song info from first difficulty
  const songInfo = difficulties[0];
  const { songName, musicType } = songInfo;

  // Use JSON data for metadata if available
  const artist = jsonSong?.artist || "Unknown Artist";
  const cover = jsonSong?.image_url
    ? (region === "intl" ? `https://maimaidx-eng.com/maimai-mobile/img/Music/${jsonSong.image_url}` : `https://maimaidx.jp/maimai-mobile/img/Music/${jsonSong.image_url}`)
    : "https://maimaidx.jp/maimai-mobile/img/Music/default.png";
  const genre = normalizeGenre(jsonSong?.catcode || "Unknown");

  // Prepare each difficulty as a separate record
  for (const difficulty of difficulties) {
    const difficultyName = difficultyNames[difficulty.difficultyNumber] as Difficulty;

    // Calculate addedVersion: -1 for versions 0-12, version-13 for versions 13+
    const addedVersion = difficulty.version <= 12 ? -1 : difficulty.version - 13;

    const { bpm, noteDesigner, noteCounts } = getExtraDataFromDxData(songName, musicType, difficultyName, dxData);

    records.push({
      songName,
      artist,
      cover,
      difficulty: difficultyName as Difficulty,
      level: difficulty.level,
      levelPrecise: getPreciseLevelValue(songName, difficulty.level, musicType, difficultyName, region, 12, dxData),
      type: musicType as SongType,
      genre,
      addedVersion,
      bpm,
      noteDesigner,
      noteCounts,
    });
  }

  console.log(`Prepared ${records.length} difficulty entries for ${songName}@${musicType} from scraped data`);
  return records;
}

// Helper function to prepare song entries using fetched metadata
function prepareSongEntriesWithFetchedData(difficulties: ParsedSong[], songDetail: ReturnType<typeof parseSongDetail>, region: Region, dxData: DxRatingResponse): UpdateSong[] {
  const difficultyNames = ["basic", "advanced", "expert", "master", "remaster"];
  const records: UpdateSong[] = [];

  // Get common song info from first difficulty
  const songInfo = difficulties[0];
  const { songName, musicType } = songInfo;

  // Use fetched metadata
  const { artist, coverUrl, genre } = songDetail;

  // Prepare each difficulty as a separate record
  for (const difficulty of difficulties) {
    const difficultyName = difficultyNames[difficulty.difficultyNumber] as Difficulty;

    // Calculate addedVersion: -1 for versions 0-12, version-13 for versions 13+
    const addedVersion = difficulty.version <= 12 ? -1 : difficulty.version - 13;

    records.push({
      songName,
      artist,
      cover: coverUrl,
      difficulty: difficultyName,
      level: difficulty.level,
      levelPrecise: getPreciseLevelValue(songName, difficulty.level, musicType, difficultyName, region, 12, dxData),
      type: musicType,
      genre,
      addedVersion,
      bpm: null,
      noteDesigner: null,
      noteCounts: null,
    });
  }

  console.log(`Prepared ${records.length} difficulty entries for ${songName}@${musicType} from fetched data`);
  return records;
}

// Helper function to load fallback JSON data
async function loadFallbackJsonData(region: Region, version: number): Promise<any[] | null> {
  try {
    const filePath = join(process.cwd(), "data", "extra", `${region}-${version}.json`);
    console.log(`Checking for fallback JSON file: ${filePath}`);

    const fileContent = await fs.readFile(filePath, "utf-8");
    const jsonData = JSON.parse(fileContent);

    console.log(`Loaded ${jsonData.length} fallback songs from ${region}-${version}.json`);
    return jsonData;
  } catch (error) {
    console.log(`No fallback JSON file found for ${region}-${version} or error reading it:`, error instanceof Error ? error.message : "Unknown error");
    return null;
  }
}

// Helper function to load exclusion JSON data
async function loadExclusionJsonData(region: Region, version: number): Promise<string[] | null> {
  try {
    const filePath = join(process.cwd(), "data", "exclusion", `${region}-${version}.json`);
    console.log(`Checking for exclusion JSON file: ${filePath}`);

    if (!(await fs.stat(filePath)).isFile()) {
      console.log(`No exclusion JSON file found for ${region}-${version}`);
      return null;
    }

    const fileContent = await fs.readFile(filePath, "utf-8");
    const jsonData = JSON.parse(fileContent) as string[];

    console.log(`Loaded ${jsonData.length} exclusion songs from ${region}-${version}.json`);
    return jsonData;
  } catch (error) {
    console.log(`No exclusion JSON file found for ${region}-${version} or error reading it:`, error instanceof Error ? error.message : "Unknown error");
    return null;
  }
}

// Helper function to convert fallback JSON songs to database records
function convertFallbackJsonToRecords(fallbackSongs: any[]): UpdateSong[] {
  const records: UpdateSong[] = [];
  const difficultyMap = {
    "easy": "basic",
    "advanced": "advanced",
    "expert": "expert",
    "master": "master",
    "remaster": "remaster"
  };

  for (const song of fallbackSongs) {
    const { title, artist, genre, type, addedVersion, cover, levels, bpm, noteDesigner, noteCounts } = song;

    // Process each difficulty level in the song
    for (const [difficultyKey, difficultyData] of Object.entries(levels)) {
      const mappedDifficulty = difficultyMap[difficultyKey as keyof typeof difficultyMap];
      if (!mappedDifficulty || !difficultyData) continue;

      const levelData = difficultyData as { level: Level; levelPrecise: number };

      records.push({
        songName: title,
        artist,
        cover,
        difficulty: mappedDifficulty as Difficulty,
        level: levelData.level,
        levelPrecise: levelData.levelPrecise,
        type: type as SongType,
        genre,
        addedVersion,
        bpm,
        noteDesigner,
        noteCounts,
      });
    }
  }

  console.log(`Converted ${records.length} records from ${fallbackSongs.length} fallback songs`);
  return records;
}

// Helper function to check if a song record already exists in the list
function songRecordExists(records: UpdateSong[], songName: string, difficulty: Difficulty, type: SongType): boolean {
  return records.some(record =>
    record.songName === songName &&
    record.difficulty === difficulty &&
    record.type === type
  );
}

// Helper function to add fallback songs that don't already exist
function addFallbackSongs(allRecords: UpdateSong[], fallbackRecords: UpdateSong[]): number {
  let addedCount = 0;

  for (const fallbackRecord of fallbackRecords) {
    const fallbackSongName = normalizeName(fallbackRecord.songName);
    if (!songRecordExists(allRecords, fallbackSongName, fallbackRecord.difficulty, fallbackRecord.type)) {
      allRecords.push(fallbackRecord);
      addedCount++;
      console.log(`Added fallback song: ${fallbackSongName} (${fallbackRecord.difficulty}, ${fallbackRecord.type})`);
    } else {
      console.log(`Skipped duplicate fallback song: ${fallbackSongName} (${fallbackRecord.difficulty}, ${fallbackRecord.type})`);
    }
  }

  console.log(`Added ${addedCount} fallback songs out of ${fallbackRecords.length} candidates`);
  return addedCount;
}

export async function GET(request: NextRequest) {
  try {
    // Check for admin token authentication
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    // Validate token against environment variable
    const adminToken = process.env.ADMIN_UPDATE_TOKEN;
    if (!adminToken) {
      console.error("ADMIN_UPDATE_TOKEN environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (token !== adminToken) {
      console.warn("Invalid admin token attempt");
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 403 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const maimaiToken = searchParams.get('token');
    const region = searchParams.get('region') as "intl" | "jp";

    if (!maimaiToken) {
      return NextResponse.json(
        { error: "Missing 'token' query parameter" },
        { status: 400 }
      );
    }

    if (!region || (region !== "intl" && region !== "jp")) {
      return NextResponse.json(
        { error: "Missing or invalid 'region' query parameter. Must be 'intl' or 'jp'" },
        { status: 400 }
      );
    }

    console.log(`Admin update requested: scraping maimai data for region ${region}`);

    // Step 1: Validate the maimai token
    console.log("Validating maimai token...");
    const [cookies, cookiesError] = await awaitWrapper(login(region, maimaiToken));

    if (cookiesError) {
      return NextResponse.json(
        { error: cookiesError.message },
        { status: 400 }
      );
    }

    // Step 3: Fetch and parse song data for all difficulties (0-4) and versions
    const currentVersion: VersionId = getCurrentVersion(region);
    const allSongData: ParsedSong[] = await prepareMaimaiScraper(region, cookies!);

    // Step 4: Fetch maimai songs JSON data and dxdata.json for accurate internal level values
    console.log("Fetching maimai songs JSON data and dxdata.json for internal level values...");
    const songsJsonData: OfficialSong[] = await fetchBaseSongs(region);
    const dxData: DxRatingResponse = await fetchDxDataJson();
    console.log(`Loaded ${songsJsonData.length} songs from JSON data, ${dxData.songs.length} dxdata entries`);

    // Step 5: Create a map of songs by title for quick lookup
    const officialSongsJsonMap = new Map<string, OfficialSong>();
    songsJsonData.forEach((song: OfficialSong) => {
      officialSongsJsonMap.set(normalizeName(song.title), song);
    });

    // Step 6: Process songs using scraped data and JSON metadata
    console.log("Step 6: Processing songs with scraped data and JSON metadata...");
    const songsNeedingFetch: ParsedSong[] = [];

    // Group songs by song name and type to combine all difficulties
    const songsGrouped = new Map<string, ParsedSong[]>();
    allSongData.forEach(song => {
      const songKey = `${song.songName}@${song.musicType}`;
      if (!songsGrouped.has(songKey)) {
        songsGrouped.set(songKey, []);
      }
      songsGrouped.get(songKey)!.push(song);
    });

    console.log(`Found ${songsGrouped.size} unique songs to process...`);

    let processedFromJson = 0;
    let processedFromFetch = 0;
    const allRecordsToInsert: UpdateSong[] = [];

    // Process each unique song
    for (const [songKey, difficulties] of songsGrouped) {
      try {
        // Get the first song to extract common info
        const songInfo = difficulties[0];
        const officialJsonSong = officialSongsJsonMap.get(songInfo.songName);

        if (officialJsonSong) {
          // Prepare song entries from scraped difficulty data with JSON metadata
          const records = prepareSongEntriesFromScrapedData(difficulties, officialJsonSong, region, dxData);
          allRecordsToInsert.push(...records);
          console.log(`Successfully processed ${songKey} (with JSON data) - ${difficulties.length} difficulties`);
          processedFromJson++;
        } else {
          // Need to fetch individual song details
          console.log(`${songKey} not found in JSON, will fetch individually`);
          songsNeedingFetch.push(songInfo);
        }
      } catch (error) {
        console.error(`Error processing song ${songKey}:`, error);
        // Add to fetch queue as fallback
        songsNeedingFetch.push(difficulties[0]);
      }
    }

    console.log(`Processed ${processedFromJson} songs from JSON`);
    console.log(`${songsNeedingFetch.length} songs need individual fetching`);

    // Step 7: Check if any songs found in JSON were not found in pre-fetch
    console.log("Step 7: Checking if any songs found in JSON were not found in pre-fetch...");
    const exclusionData = await loadExclusionJsonData(region, currentVersion) || [];
    const songsNotFoundInPreFetch = Array.from(officialSongsJsonMap.entries())
      .flatMap(([key, song]) => {
        const hasStd = "lev_adv" in song;
        const hasDx = "lev_dx" in song;
        const flat = []
        if (hasStd) flat.push({ songName: key, musicType: "std" });
        if (hasDx) flat.push({ songName: key, musicType: "dx" });
        return flat;
      })
      .filter(song => !exclusionData.includes(`${song.songName}@${song.musicType}`))
      .filter(song => !songsGrouped.has(`${song.songName}@${song.musicType}`));
    console.log(`Found ${songsNotFoundInPreFetch.length} songs not found in pre-fetch`);
    for (const song of songsNotFoundInPreFetch) {
      console.log(` - ${song.songName} (${song.musicType})`);
    }

    // Step 8: Fetch remaining songs individually (sequential with 500ms delay)
    if (songsNeedingFetch.length > 0) {
      console.log("Step 8: Fetching remaining songs individually...");

      for (let i = 0; i < songsNeedingFetch.length; i++) {
        const song = songsNeedingFetch[i];
        const songKey = `${song.songName}@${song.musicType}`;

        try {
          console.log(`Fetching details for song ${i + 1}/${songsNeedingFetch.length}: ${songKey}`);

          // Fetch detailed song information
          const songDetail = await fetchSongDetail(region, cookies!, song.inputName, song.inputValue);

          // Get all difficulties for this song from the grouped data
          const difficulties = songsGrouped.get(songKey) || [];

          // Prepare song entries using fetched metadata
          const records = prepareSongEntriesWithFetchedData(difficulties, songDetail, region, dxData);
          allRecordsToInsert.push(...records);

          console.log(`Successfully processed ${songKey} (with fetched data) - ${difficulties.length} difficulties`);
          processedFromFetch++;

          // Add 500ms delay between requests (except for the last one)
          if (i < songsNeedingFetch.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }

        } catch (error) {
          console.error(`Error processing song ${songKey}:`, error);
          // Continue with other songs even if one fails
        }
      }
    }

    // Step 9: Load and add fallback songs from JSON files if they exist
    console.log("Step 9: Loading fallback songs from JSON files...");
    const fallbackJsonData = await loadFallbackJsonData(region, currentVersion);

    let fallbackSongsAdded = 0;
    if (fallbackJsonData && fallbackJsonData.length > 0) {
      console.log(`Found fallback JSON data with ${fallbackJsonData.length} songs`);

      // Convert fallback JSON to database records format
      const fallbackRecords = convertFallbackJsonToRecords(fallbackJsonData);

      // Add fallback songs that don't already exist
      fallbackSongsAdded = addFallbackSongs(allRecordsToInsert, fallbackRecords);

      console.log(`Added ${fallbackSongsAdded} fallback songs from ${region}-${currentVersion}.json`);
    } else {
      console.log(`No fallback songs found for ${region}-${currentVersion}.json`);
    }

    // Convert to json
    const newRecords = allRecordsToInsert
      // sort keys
      .map(record => sortKeys(record))
      .sort((a, b) => a.songName.localeCompare(b.songName) * 1000000 + a.difficulty.localeCompare(b.difficulty) * 1000 + a.type.localeCompare(b.type));

    return NextResponse.json({
      success: true,
      message: "Song data update completed",
      records: newRecords,
    });

  } catch (error) {
    logger.error({ error, context: "admin-update" }, "Error in admin update route");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// Only allow GET requests
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
