import { describe, it, expect, beforeAll } from "vitest";
import { value, type CatalogFetchContext, type SourceChart } from "@/server/services/catalog/ingestion/types";
import { asCatalogFetcher } from "@/server/services/catalog/ingestion/merge";
import { catalogChartLabel } from "@/server/services/catalog/ingestion/normalize-charts";
import pino from "pino";
import { getCurrentVersion } from "@/lib/games/versions";
import { chartTypeToCode, difficultyToCode } from "@/lib/games/maimai/codes";
import { loginAndGetCookies } from "../login";
import { MaimaiBaseFetcher } from "./sources/base-songs";
import { DxDataFetcher } from "./sources/dxrating";
import { maimaiCatalogStages } from "./pipeline";
import { maimaiLevelPolicy } from "./chart";
import { fillMissingStage } from "@/server/services/catalog/ingestion/levels";
import { fetchSongDataForDifficulty, toSourceChart } from "./sources/scraper";
import { openGameSite } from "@/server/services/games/sega/http";
import { assertMaimaiPage } from "../scores/parse-utils";

const TOKEN = process.env.TOKEN;
const testLog = pino({ enabled: false });
const shouldSkip = !TOKEN;
const MASTER = difficultyToCode("master");

// Scaled-down scraper
const ScaledMaimaiScraperFetcher = (versionToFetch: number) => asCatalogFetcher(async ({ region, session, log }) => {
  log.info("Fetching master difficulty songs only (scaled test)...");

  const difficulty = 3; // master

  const parsedSongs = await fetchSongDataForDifficulty(
    openGameSite("maimai", region, session, { assertPage: assertMaimaiPage }),
    "master",
    difficulty,
    versionToFetch + 13,
    log
  );

  log.info(`Fetched ${parsedSongs.length} songs from scaled scraper`);

  return parsedSongs.map(toSourceChart);
});

describe.skipIf(shouldSkip)("Integration: LevelFetcher", () => {
  let context: CatalogFetchContext;
  let scraperSongs: SourceChart[];
  let mergedSongs: SourceChart[];

  beforeAll(async () => {
    if (!TOKEN) {
      return;
    }

    // Force region to intl as requested
    const region = "intl";
    const version = getCurrentVersion("maimai", region);

    // Login and get cookies
    testLog.info("Logging in to get cookies...");
    const cookies = await loginAndGetCookies(region, TOKEN);
    testLog.info("Login successful, cookies obtained");

    // Create base context
    context = {
      region,
      version,
      session: { cookies },
      log: testLog,
      notice: { addDetail() {}, details: [] },
    };
    scraperSongs = await ScaledMaimaiScraperFetcher(11)(context, []);
    mergedSongs = await MaimaiBaseFetcher(context, scraperSongs);
  }, 60000); // 60 second timeout for login

  it("should fetch and merge songs from ScaledMaimaiScraperFetcher and MaimaiBaseFetcher", async () => {
    // Validate scraper results
    expect(scraperSongs.length).toBeGreaterThan(0);

    // All songs should be master difficulty
    for (const song of scraperSongs) {
      expect(song.difficulty).toBe(MASTER);
    }

    // Check a few songs have the expected fields from scraper
    const sampleScraperSong = scraperSongs[0];
    expect(sampleScraperSong.songName).toBeDefined();
    expect(sampleScraperSong.chartType).toBeDefined();
    expect(sampleScraperSong.difficulty).toBe(MASTER);
    expect(value(sampleScraperSong.level)).toBeDefined();
    expect(value(sampleScraperSong.addedVersion)).toBeDefined();
    expect(sampleScraperSong.extras).toBeDefined();
    expect(sampleScraperSong.extras?.inputName).toBeDefined();
    expect(sampleScraperSong.extras?.inputValue).toBeDefined();

    // Artist, cover, and genre should NOT be filled by scraper
    expect(value(sampleScraperSong.artist)).toBeUndefined();
    expect(value(sampleScraperSong.cover)).toBeUndefined();
    expect(value(sampleScraperSong.genre)).toBeUndefined();

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

    testLog.info(`Songs with artist: ${songsWithArtist}/${mergedSongs.length}`);
    testLog.info(`Songs with cover: ${songsWithCover}/${mergedSongs.length}`);
    testLog.info(`Songs with genre: ${songsWithGenre}/${mergedSongs.length}`);

    testLog.info(`Songs without artist: ${mergedSongs.filter(s => !value(s.artist)).map(catalogChartLabel).join(', ')}`)

    // Most songs should have been enriched (allowing for some missing data)
    expect(songsWithArtist).toBeGreaterThan(mergedSongs.length * 0.8);
    expect(songsWithCover).toBeGreaterThan(mergedSongs.length * 0.8);
    expect(songsWithGenre).toBeGreaterThan(mergedSongs.length * 0.8);
  }, 60000); // 1 minute timeout for scaled test

  it("should have valid data types and formats", async () => {
    // Check data types and formats for all songs (should be small dataset)
    for (const song of mergedSongs) {
      // songName should be a non-empty string
      expect(typeof song.songName).toBe("string");
      expect(song.songName.length).toBeGreaterThan(0);

      expect([chartTypeToCode("std"), chartTypeToCode("dx")]).toContain(song.chartType);

      // difficulty should be master (since we only fetched master)
      expect(song.difficulty).toBe(MASTER);

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

  it("should fetch and merge through DxDataFetcher pipeline", async () => {
    const baseSongs = mergedSongs;

    // Step 3: Run DxDataFetcher
    testLog.info("Running DxDataFetcher...");
    const finalSongs = await DxDataFetcher(context, baseSongs);
    testLog.info(`DxDataFetcher returned ${finalSongs.length} songs`);
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
    expect(fullyEnrichedSong!.difficulty).toBe(MASTER);
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

    testLog.info(`Songs with levelPrecise: ${songsWithLevelPrecise}/${finalSongs.length}`);
    testLog.info(`Songs with bpm: ${songsWithBpm}/${finalSongs.length}`);
    testLog.info(`Songs with noteDesigner: ${songsWithNoteDesigner}/${finalSongs.length}`);
    testLog.info(`Songs with noteCounts: ${songsWithNoteCounts}/${finalSongs.length}`);
    testLog.info(`Songs with genre: ${songsWithGenre}/${finalSongs.length}`);

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

  it("should handle Link properly", async () => {
    testLog.info("Running ScaledMaimaiScraperFetcher...");
    const isLinkMaster = (s: SourceChart) => s.songName === "Link" && s.difficulty === MASTER;
    const describeCharts = (charts: SourceChart[]) => charts.map(s => catalogChartLabel(s) + "@" + value(s.artist) + "@" + value(s.addedVersion));
    let songs = [
      ...await ScaledMaimaiScraperFetcher(-12)(context, []),
      ...await ScaledMaimaiScraperFetcher(-9)(context, []),
    ].filter(isLinkMaster);
    testLog.info(`At base: ${songs.length} songs with ${describeCharts(songs)}`);

    for (const stage of [...maimaiCatalogStages("intl").slice(1), fillMissingStage(maimaiLevelPolicy(context.version))]) {
      songs = (await stage.run(context, songs)).filter(isLinkMaster);
      testLog.info(`Merged ${stage.name}: got ${songs.length} songs with ${describeCharts(songs)}`);
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
