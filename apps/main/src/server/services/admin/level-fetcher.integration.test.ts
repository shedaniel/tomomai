import { describe, it, expect, beforeAll } from "vitest";
import { PendingSong, value } from "@/server/utils/admin/type";
import type { Logger } from "pino";
import { getCurrentVersion, VersionId } from "@/lib/metadata";
import { loginAndGetCookies } from "@/server/services/maimai-login";
import { MaimaiBaseFetcher } from "./maimai-base-songs";
import { DxDataFetcher } from "./dxrating";
import { FETCHERS, FetchingContextExtended } from "./level-fetcher";
import { asFetcher, FetchingContext, key, mergeSongs, SongFetcher } from "./fetcher-utils";
import { fetchSongDataForDifficulty, parsedSongToPendingSong } from "./maimai-scraper";

// Skip this test suite if TOKEN environment variable is not provided
const TOKEN = process.env.TOKEN;
const shouldSkip = !TOKEN;

// Mock logger for testing
function createTestLogger(): Logger {
  const logs: any[] = [];
  const mockLogger = {
    logs,
    trace: (...args: any[]) => logs.push({ level: "trace", args }),
    debug: (...args: any[]) => logs.push({ level: "debug", args }),
    info: (...args: any[]) => logs.push({ level: "info", args }),
    warn: (...args: any[]) => logs.push({ level: "warn", args }),
    error: (...args: any[]) => logs.push({ level: "error", args }),
    child: (bindings: any) => {
      const childLogger = createTestLogger();
      (childLogger as any).logs = logs; // Share logs with parent
      return childLogger;
    },
  } as any;
  return mockLogger;
}

// Scaled-down scraper
const ScaledMaimaiScraperFetcher = (versionToFetch: VersionId) => asFetcher(async ({ region, version, cookies, log }) => {
  log.info("Fetching master difficulty songs only (scaled test)...");

  const difficulty = 3; // master

  const parsedSongs = await fetchSongDataForDifficulty(
    region,
    cookies,
    "master",
    difficulty,
    versionToFetch + 13,
    log
  );

  log.info(`Fetched ${parsedSongs.length} songs from scaled scraper`);

  return parsedSongs.map(parsedSongToPendingSong);
});

describe.skipIf(shouldSkip)("Integration: LevelFetcher", () => {
  let cookies: string;
  let context: FetchingContext;

  beforeAll(async () => {
    if (!TOKEN) {
      return;
    }

    // Force region to intl as requested
    const region = "intl";
    const version = getCurrentVersion(region);

    // Login and get cookies
    console.log("Logging in to get cookies...");
    cookies = await loginAndGetCookies(region, TOKEN);
    console.log("Login successful, cookies obtained");

    // Create base context
    context = {
      region,
      version,
      cookies,
      log: createTestLogger(),
      notice: { addDetail() {}, details: [] },
    };
  }, 60000); // 60 second timeout for login

  it("should fetch and merge songs from ScaledMaimaiScraperFetcher and MaimaiBaseFetcher", async () => {
    // Step 1: Run ScaledMaimaiScraperFetcher (only master, version 11)
    console.log("Running ScaledMaimaiScraperFetcher (master difficulty, version 11)...");
    const scraperContext = {
      ...context,
      previous: null,
      current: ScaledMaimaiScraperFetcher(11) as SongFetcher,
      fetcherIndex: 0,
    };

    const scraperSongs = await ScaledMaimaiScraperFetcher(11)(scraperContext, []);
    console.log(`ScaledMaimaiScraperFetcher returned ${scraperSongs.length} songs`);

    // Validate scraper results
    expect(scraperSongs.length).toBeGreaterThan(0);

    // All songs should be master difficulty
    for (const song of scraperSongs) {
      expect(song.difficulty).toBe("master");
    }

    // Check a few songs have the expected fields from scraper
    const sampleScraperSong = scraperSongs[0];
    expect(sampleScraperSong.songName).toBeDefined();
    expect(sampleScraperSong.type).toBeDefined();
    expect(sampleScraperSong.difficulty).toBe("master");
    expect(value(sampleScraperSong.level)).toBeDefined();
    expect(value(sampleScraperSong.addedVersion)).toBeDefined();
    expect(sampleScraperSong.extras).toBeDefined();
    expect(sampleScraperSong.extras?.inputName).toBeDefined();
    expect(sampleScraperSong.extras?.inputValue).toBeDefined();

    // Artist, cover, and genre should NOT be filled by scraper
    expect(value(sampleScraperSong.artist)).toBeUndefined();
    expect(value(sampleScraperSong.cover)).toBeUndefined();
    expect(value(sampleScraperSong.genre)).toBeUndefined();

    // Step 2: Run MaimaiBaseFetcher with scraper results
    console.log("Running MaimaiBaseFetcher...");
    const baseContext = {
      ...context,
      previous: ScaledMaimaiScraperFetcher(11) as SongFetcher,
      current: MaimaiBaseFetcher as SongFetcher,
      fetcherIndex: 1,
    };

    const mergedSongs = await MaimaiBaseFetcher(baseContext, scraperSongs);
    console.log(`MaimaiBaseFetcher returned ${mergedSongs.length} songs`);

    // Validate merged results
    expect(mergedSongs.length).toBeGreaterThan(0);
    expect(mergedSongs.length).toBe(scraperSongs.length); // Should have same count (only-modify mode)

    // Find a song that should have been enriched
    const enrichedSong = mergedSongs.find(
      s => value(s.artist) && value(s.cover) && value(s.genre)
    );

    // Verify that at least some songs were enriched with base fetcher data
    expect(enrichedSong).toBeDefined();
    expect(enrichedSong!.songName).toBeDefined();
    expect(value(enrichedSong!.artist)).toBeDefined();
    expect(value(enrichedSong!.cover)).toBeDefined();
    expect(value(enrichedSong!.genre)).toBeDefined();
    expect(value(enrichedSong!.level)).toBeDefined();
    expect(value(enrichedSong!.addedVersion)).toBeDefined();

    // Verify extras from scraper were preserved
    expect(enrichedSong!.extras?.inputName).toBeDefined();
    expect(enrichedSong!.extras?.inputValue).toBeDefined();

    // Log some statistics
    const songsWithArtist = mergedSongs.filter(s => value(s.artist)).length;
    const songsWithCover = mergedSongs.filter(s => value(s.cover)).length;
    const songsWithGenre = mergedSongs.filter(s => value(s.genre)).length;

    console.log(`Songs with artist: ${songsWithArtist}/${mergedSongs.length}`);
    console.log(`Songs with cover: ${songsWithCover}/${mergedSongs.length}`);
    console.log(`Songs with genre: ${songsWithGenre}/${mergedSongs.length}`);

    console.log(`Songs without artist: ${mergedSongs.filter(s => !value(s.artist)).map(key).join(', ')}`)

    // Most songs should have been enriched (allowing for some missing data)
    expect(songsWithArtist).toBeGreaterThan(mergedSongs.length * 0.8);
    expect(songsWithCover).toBeGreaterThan(mergedSongs.length * 0.8);
    expect(songsWithGenre).toBeGreaterThan(mergedSongs.length * 0.8);
  }, 60000); // 1 minute timeout for scaled test

  it("should have valid data types and formats", async () => {
    // Run both fetchers
    const scraperContext = {
      ...context,
      previous: null,
      current: ScaledMaimaiScraperFetcher(11) as SongFetcher,
      fetcherIndex: 0,
    };
    const scraperSongs = await ScaledMaimaiScraperFetcher(11)(scraperContext, []);

    const baseContext = {
      ...context,
      previous: ScaledMaimaiScraperFetcher(11) as SongFetcher,
      current: MaimaiBaseFetcher as SongFetcher,
      fetcherIndex: 1,
    };
    const mergedSongs = await MaimaiBaseFetcher(baseContext, scraperSongs);

    // Check data types and formats for all songs (should be small dataset)
    for (const song of mergedSongs) {
      // songName should be a non-empty string
      expect(typeof song.songName).toBe("string");
      expect(song.songName.length).toBeGreaterThan(0);

      // type should be 'std' or 'dx'
      expect(["std", "dx"]).toContain(song.type);

      // difficulty should be master (since we only fetched master)
      expect(song.difficulty).toBe("master");

      // level should be defined
      expect(value(song.level)).toBeDefined();
      expect(typeof value(song.level)).toBe("string");

      // addedVersion should be a number
      const addedVersion = value(song.addedVersion);
      expect(addedVersion).toBeDefined();
      expect(typeof addedVersion).toBe("number");

      // If artist is defined, it should be a string
      const artist = value(song.artist);
      if (artist !== undefined) {
        expect(typeof artist).toBe("string");
      }

      // If cover is defined, it should be a URL string
      const cover = value(song.cover);
      if (cover !== undefined) {
        expect(typeof cover).toBe("string");
        expect(cover).toMatch(/^https?:\/\//);
      }

      // If genre is defined, it should be a string
      const genre = value(song.genre);
      if (genre !== undefined) {
        expect(typeof genre).toBe("string");
      }
    }
  }, 60000);

  it("should preserve important flags and merge correctly", async () => {
    // Run both fetchers
    const scraperContext = {
      ...context,
      previous: null,
      current: ScaledMaimaiScraperFetcher(11) as SongFetcher,
      fetcherIndex: 0,
    };
    const scraperSongs = await ScaledMaimaiScraperFetcher(11)(scraperContext, []);

    const baseContext = {
      ...context,
      previous: ScaledMaimaiScraperFetcher(11) as SongFetcher,
      current: MaimaiBaseFetcher as SongFetcher,
      fetcherIndex: 1,
    };
    const mergedSongs = await MaimaiBaseFetcher(baseContext, scraperSongs);

    // Find a song that was merged (has both scraper and base data)
    const mergedSong = mergedSongs.find(
      s =>
        value(s.artist) &&
        value(s.cover) &&
        value(s.genre) &&
        s.extras?.inputName &&
        s.extras?.inputValue
    );

    expect(mergedSong).toBeDefined();

    // Verify that level from scraper (important) was preserved
    expect(value(mergedSong!.level)).toBeDefined();

    // Verify that addedVersion from scraper (important) was preserved
    expect(value(mergedSong!.addedVersion)).toBeDefined();

    // Verify that artist, cover, genre from base (important) were added
    expect(value(mergedSong!.artist)).toBeDefined();
    expect(value(mergedSong!.cover)).toBeDefined();
    expect(value(mergedSong!.genre)).toBeDefined();

    // Verify extras were preserved
    expect(mergedSong!.extras).toBeDefined();
    expect(mergedSong!.extras?.inputName).toBeDefined();
    expect(mergedSong!.extras?.inputValue).toBeDefined();
  }, 60000);

  it("should fetch and merge through DxDataFetcher pipeline", async () => {
    // Step 1: Run ScaledMaimaiScraperFetcher
    console.log("Running ScaledMaimaiScraperFetcher...");
    const scraperContext = {
      ...context,
      previous: null,
      current: ScaledMaimaiScraperFetcher(11) as SongFetcher,
      fetcherIndex: 0,
    };
    const scraperSongs = await ScaledMaimaiScraperFetcher(11)(scraperContext, []);
    console.log(`ScaledMaimaiScraperFetcher returned ${scraperSongs.length} songs`);
    expect(scraperSongs.length).toBeGreaterThan(0);

    // Step 2: Run MaimaiBaseFetcher
    console.log("Running MaimaiBaseFetcher...");
    const baseContext = {
      ...context,
      previous: ScaledMaimaiScraperFetcher(11) as SongFetcher,
      current: MaimaiBaseFetcher as SongFetcher,
      fetcherIndex: 1,
    };
    const baseSongs = await MaimaiBaseFetcher(baseContext, scraperSongs);
    console.log(`MaimaiBaseFetcher returned ${baseSongs.length} songs`);
    expect(baseSongs.length).toBe(scraperSongs.length);

    // Step 3: Run DxDataFetcher
    console.log("Running DxDataFetcher...");
    const dxDataContext = {
      ...context,
      previous: MaimaiBaseFetcher as SongFetcher,
      current: DxDataFetcher as SongFetcher,
      fetcherIndex: 2,
    };
    const finalSongs = await DxDataFetcher(dxDataContext, baseSongs);
    console.log(`DxDataFetcher returned ${finalSongs.length} songs`);
    expect(finalSongs.length).toBe(baseSongs.length);

    // Find a song that has been fully enriched with all three fetchers
    const fullyEnrichedSong = finalSongs.find(
      s =>
        value(s.artist) &&
        value(s.cover) &&
        value(s.genre) &&
        value(s.levelPrecise) !== undefined &&
        s.extras?.inputName &&
        s.extras?.inputValue
    );

    expect(fullyEnrichedSong).toBeDefined();

    // Verify data from scraper
    expect(fullyEnrichedSong!.songName).toBeDefined();
    expect(fullyEnrichedSong!.difficulty).toBe("master");
    expect(value(fullyEnrichedSong!.level)).toBeDefined();
    expect(value(fullyEnrichedSong!.addedVersion)).toBeDefined();
    expect(fullyEnrichedSong!.extras?.inputName).toBeDefined();
    expect(fullyEnrichedSong!.extras?.inputValue).toBeDefined();

    // Verify data from base fetcher
    expect(value(fullyEnrichedSong!.artist)).toBeDefined();
    expect(value(fullyEnrichedSong!.cover)).toBeDefined();
    expect(value(fullyEnrichedSong!.genre)).toBeDefined();

    // Verify data from DxDataFetcher
    expect(value(fullyEnrichedSong!.levelPrecise)).toBeDefined();
    expect(typeof value(fullyEnrichedSong!.levelPrecise)).toBe("number");

    // Log statistics
    const songsWithLevelPrecise = finalSongs.filter(s => value(s.levelPrecise) !== undefined).length;
    const songsWithBpm = finalSongs.filter(s => value(s.bpm) !== undefined).length;
    const songsWithNoteDesigner = finalSongs.filter(s => value(s.noteDesigner) !== undefined).length;
    const songsWithNoteCounts = finalSongs.filter(s => value(s.noteCounts) !== undefined).length;
    const songsWithGenre = finalSongs.filter(s => value(s.genre) !== undefined).length;

    console.log(`Songs with levelPrecise: ${songsWithLevelPrecise}/${finalSongs.length}`);
    console.log(`Songs with bpm: ${songsWithBpm}/${finalSongs.length}`);
    console.log(`Songs with noteDesigner: ${songsWithNoteDesigner}/${finalSongs.length}`);
    console.log(`Songs with noteCounts: ${songsWithNoteCounts}/${finalSongs.length}`);
    console.log(`Songs with genre: ${songsWithGenre}/${finalSongs.length}`);

    // Most songs should have been enriched with DxData (allowing for some missing data)
    expect(songsWithLevelPrecise).toBeGreaterThan(finalSongs.length * 0.7);

    // Verify optional fields have correct types when present
    const songWithBpm = finalSongs.find(s => value(s.bpm) !== undefined);
    if (songWithBpm) {
      const bpm = value(songWithBpm.bpm);
      expect(typeof bpm).toBe("number");
    }

    const songWithNoteDesigner = finalSongs.find(s => value(s.noteDesigner) !== undefined);
    if (songWithNoteDesigner) {
      const noteDesigner = value(songWithNoteDesigner.noteDesigner);
      expect(typeof noteDesigner).toBe("string");
    }

    const songWithNoteCounts = finalSongs.find(s => value(s.noteCounts) !== undefined);
    if (songWithNoteCounts) {
      const noteCounts = value(songWithNoteCounts.noteCounts);
      expect(noteCounts).toBeDefined();
      expect(typeof noteCounts!.tap).toBe("number");
      expect(typeof noteCounts!.hold).toBe("number");
      expect(typeof noteCounts!.slide).toBe("number");
      expect(typeof noteCounts!.touch).toBe("number");
      expect(typeof noteCounts!.break).toBe("number");
    }
  }, 60000);

  it.only("should handle Link properly", async () => {
    console.log("Running ScaledMaimaiScraperFetcher...");
    const fetchers = [...FETCHERS]
    // remove first fetcher
    fetchers.splice(0, 1);

    const scraperContext = {
      ...context,
      previous: null,
      current: fetchers[0],
      fetcherIndex: 0,
    } as FetchingContextExtended;
    let songs: PendingSong[] = [];
    songs = [
      ...await ScaledMaimaiScraperFetcher(-12)(scraperContext, []),
      ...await ScaledMaimaiScraperFetcher(-9)(scraperContext, []),
    ].filter(s => s.songName === "Link" && s.difficulty === "master")
    console.log(`At base: ${songs.length} songs with ${songs.map(s => key(s) + "@" + value(s.artist) + "@" + value(s.addedVersion))}`);

    for (const fetcher of fetchers) {
      scraperContext.current = fetcher;
      scraperContext.forceMode = "default"
      const newSongs = (await fetcher(scraperContext, [])).filter(s => s.songName === "Link" && s.difficulty === "master");
      console.log(`At #${scraperContext.fetcherIndex}: got ${newSongs.length} songs with ${newSongs.map(s => key(s) + "@" + value(s.artist) + "@" + value(s.addedVersion))}`);
      scraperContext.forceMode = undefined
      songs = (await fetcher(scraperContext, songs)).filter(s => s.songName === "Link" && s.difficulty === "master");
      console.log(`Merged #${scraperContext.fetcherIndex}: got ${songs.length} songs with ${songs.map(s => key(s) + "@" + value(s.artist) + "@" + value(s.addedVersion))}`);
      scraperContext.previous = fetcher;
      scraperContext.fetcherIndex++;
    }

    expect(songs.length).toBe(2);
    expect(value(songs[0].artist)).toBeDefined();
    expect(value(songs[1].artist)).toBeDefined();

    const friends = songs.filter(s => value(s.artist)?.startsWith("Circle of friends")).at(0);
    const clean = songs.filter(s => value(s.artist)?.startsWith("Clean")).at(0);

    expect(friends).toBeDefined();
    expect(clean).toBeDefined();

    expect(value(friends?.levelPrecise)).toBe(125);
    expect(value(friends?.addedVersion)).toBe(-9);
    expect(value(friends?.genre)).toBe("niconico＆ボーカロイド");
    expect(value(clean?.levelPrecise)).toBe(125);
    expect(value(clean?.addedVersion)).toBe(-12);
    expect(value(clean?.genre)).toBe("maimai");
  }, 60000);
});
