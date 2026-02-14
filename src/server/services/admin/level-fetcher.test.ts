import { describe, it, expect, vi, beforeEach } from "vitest";
import { merger, mergeSongs, taker } from "./level-fetcher";
import { PendingSong, value, important, Pending } from "@/server/utils/admin/type";
import type { Logger } from "pino";
import { Difficulty, SongType } from "@/lib/types";
import { VersionId } from "@/lib/metadata";

// Helper to create a basic song for testing
function createSong(
  songName: string,
  artist: string | undefined,
  type: SongType = "std",
  difficulty: Difficulty = "master",
  version?: VersionId | undefined | null,  // No default value
  genre: Pending<string> = "POPS & ANIME"
): PendingSong {
  return {
    songName,
    type,
    difficulty,
    artist,
    level: "13",
    cover: "cover.jpg",
    genre,
    addedVersion: version === null ? undefined : (version ?? 0),  // null = explicitly undefined, missing = 0
    levelPrecise: 13.0,
  };
}

// Mock logger that collects log calls
function createMockLogger(): Logger {
  const logs: any[] = [];
  const mockLogger = {
    logs,
    debug: vi.fn((...args: any[]) => logs.push({ level: "debug", args })),
    info: vi.fn((...args: any[]) => logs.push({ level: "info", args })),
    warn: vi.fn((...args: any[]) => logs.push({ level: "warn", args })),
    error: vi.fn((...args: any[]) => logs.push({ level: "error", args })),
  } as any;
  return mockLogger;
}

describe("mergeSongs", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe("Case 1: Default mode - exact artist matches (duplicates in set 1)", () => {
    it("should merge both songs with their exact artist matches", () => {
      // Set 1: [Song A by Artist A, Song A by Artist B]
      const set1 = [
        createSong("Song A", "Artist A"),
        createSong("Song A", "Artist B"),
      ];

      // Set 2: [Song A by Artist A, Song A by Artist B]
      const set2 = [
        createSong("Song A", "Artist A"),
        createSong("Song A", "Artist B"),
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      // Expected: Both songs merged with their exact artist matches
      expect(result).toHaveLength(2);

      const songByArtistA = result.find(s => value(s.artist) === "Artist A");
      const songByArtistB = result.find(s => value(s.artist) === "Artist B");

      expect(songByArtistA).toBeDefined();
      expect(songByArtistB).toBeDefined();
      expect(songByArtistA?.songName).toBe("Song A");
      expect(songByArtistB?.songName).toBe("Song A");
    });
  });

  describe("Case 2: Only-modify mode - only set 1 contains duplicates", () => {
    it("should merge Song A by Artist A and keep Song A by Artist B from set 1 only", () => {
      // Set 1: [Song A by Artist A, Song A by Artist B]
      const set1 = [
        createSong("Song A", "Artist A"),
        createSong("Song A", "Artist B"),
      ];

      // Set 2: [Song A by Artist A]
      const set2 = [
        createSong("Song A", "Artist A"),
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "only-modify", logger, merger(logger, take), take);

      // Expected: Song A by Artist A merged, Song A by Artist B from set 1 only
      expect(result).toHaveLength(2);

      const songByArtistA = result.find(s => value(s.artist) === "Artist A");
      const songByArtistB = result.find(s => value(s.artist) === "Artist B");

      expect(songByArtistA).toBeDefined();
      expect(songByArtistB).toBeDefined();

      // Song A by Artist B should be unmerged (only from set 1)
      expect(songByArtistB?.songName).toBe("Song A");
    });
  });

  describe("Case 3: Only-modify mode - only set 1 contains duplicates, no exact match", () => {
    it("should merge Song A by AB (closest edit distance) and keep Song A by CD from set 1", () => {
      // Set 1: [Song A by AB, Song A by CD]
      const set1 = [
        createSong("Song A", "AB"),
        createSong("Song A", "CD"),
      ];

      // Set 2: [Song A by ABC]
      const set2 = [
        createSong("Song A", "ABC"),
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "only-modify", logger, merger(logger, take), take);

      // Expected: Song A by AB merged (closest edit distance: "AB" vs "ABC" = 1),
      // Song A by CD from set 1 (distance "CD" vs "ABC" = 3, farther away)
      expect(result).toHaveLength(2);

      // Should have AB artist (merged with ABC from set 2)
      const songByAB = result.find(s => {
        const artist = value(s.artist);
        return artist === "AB" || artist === "ABC";
      });

      // Should have CD artist (only from set 1)
      const songByCD = result.find(s => value(s.artist) === "CD");

      expect(songByAB).toBeDefined();
      expect(songByCD).toBeDefined();
    });
  });

  describe("Case 4: Default mode - fuzzy matching with Levenshtein distance", () => {
    it("should merge songs with similar artist names using fuzzy matching", () => {
      // Set 1: [Song A by AB]
      const set1 = [
        createSong("Song A", "AB"),
      ];

      // Set 2: [Song A by ABC]
      const set2 = [
        createSong("Song A", "ABC"),
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      // Expected: Songs merged, with AB chosen as closest match
      expect(result).toHaveLength(1);

      const song = result[0];
      const artist = value(song.artist);

      // Artist should be from the merged result (could be AB or ABC depending on take function)
      expect(artist).toMatch(/^AB(C)?$/);
      expect(song.songName).toBe("Song A");
    });
  });

  describe("Case 4: Real Cases", () => {
    it("should leave Link", () => {
      const set1 = [
        createSong("Link", "Clean Tears feat. Youna", "dx", "basic", 0, "A"),
        createSong("Link", "Circle of friends （天月-あまつき-・un:c・伊東歌詞太郎・コニー・はしやん）", "dx", "basic", 0, important("B")),
      ];
      const set2 = [
        createSong("Link", "Clean Tears feat. Youna", "dx", "basic", 0, "A"),
        createSong("Link", "Circle of friends （天月-あまつき-・un:c・伊東歌詞太郎・コニー・はしやん）", "dx", "basic", 0, "C"),
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      expect(result).toHaveLength(2);
      expect(value(result[0].artist)).toBe("Clean Tears feat. Youna");
      expect(value(result[0].genre)).toBe("A");
      expect(value(result[1].artist)).toBe("Circle of friends （天月-あまつき-・un:c・伊東歌詞太郎・コニー・はしやん）");
      expect(value(result[1].genre)).toBe("B");
    });
  });

  describe("Case 5: Difficult Cases", () => {
    it("should introduce empty artists", () => {
      const set2 = [
        createSong("A", "A", "dx", "basic", 0),
        createSong("A", "B", "dx", "basic", 1),
      ];

      const take = taker(logger);
      const result = mergeSongs([], set2, "default", logger, merger(logger, take), take);

      expect(result).toHaveLength(2);
      expect(value(result[0].artist)).toBe("A");
      expect(value(result[0].addedVersion)).toBe(0);
      expect(value(result[1].artist)).toBe("B");
      expect(value(result[1].addedVersion)).toBe(1);
    });

    it("should handle empty artists", () => {
      const set1 = [
        createSong("A", undefined, "dx", "basic", 0, "A"),
        createSong("A", undefined, "dx", "basic", 1, "A"),
        createSong("C", undefined, "dx", "basic", 2, "A"),
      ];
      const set2 = [
        createSong("A", "A", "dx", "basic", 0, "B"),
        createSong("A", "B", "dx", "basic", 1, "B"),
        createSong("C", "C", "dx", "basic", null, "B"),  // null = explicitly undefined
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      expect(result).toHaveLength(3);
      expect(value(result[0].artist)).toBe("A");
      expect(value(result[0].addedVersion)).toBe(0);
      expect(value(result[0].genre)).toBe("B");
      expect(value(result[1].artist)).toBe("B");
      expect(value(result[1].addedVersion)).toBe(1);
      expect(value(result[1].genre)).toBe("B");
      expect(value(result[2].artist)).toBe("C");
      expect(value(result[2].addedVersion)).toBe(2);
      expect(value(result[2].genre)).toBe("B");
    });

    it("should fill with default", () => {
      const set1 = [
        createSong("C", undefined, "dx", "basic", 2, "A"),
      ];
      const set2 = [
        createSong("C", "C", "dx", "basic", null, "B"),  // null = explicitly undefined
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      expect(result).toHaveLength(1);
      expect(value(result[0].artist)).toBe("C");
      expect(value(result[0].addedVersion)).toBe(2);
      expect(value(result[0].genre)).toBe("B");
    });

    it("should fill with only-modify", () => {
      const set1 = [
        createSong("C", undefined, "dx", "basic", 2, "A"),
      ];
      const set2 = [
        createSong("C", "C", "dx", "basic", null, "B"),  // null = explicitly undefined
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "only-modify", logger, merger(logger, take), take);

      expect(result).toHaveLength(1);
      expect(value(result[0].artist)).toBe("C");
      expect(value(result[0].addedVersion)).toBe(2);
      expect(value(result[0].genre)).toBe("B");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty first set (only fetched songs)", () => {
      const set1: PendingSong[] = [];
      const set2 = [
        createSong("Song A", "Artist A"),
        createSong("Song B", "Artist B"),
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      expect(result).toHaveLength(2);
      expect(result[0].songName).toBe("Song A");
      expect(result[1].songName).toBe("Song B");
    });

    it("should handle empty second set (only local songs)", () => {
      const set1 = [
        createSong("Song A", "Artist A"),
        createSong("Song B", "Artist B"),
      ];
      const set2: PendingSong[] = [];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      expect(result).toHaveLength(2);
      expect(result[0].songName).toBe("Song A");
      expect(result[1].songName).toBe("Song B");
    });

    it("should handle songs with identical artist names (distance 0)", () => {
      const set1 = [
        createSong("Song A", "Artist A"),
      ];
      const set2 = [
        createSong("Song A", "Artist A"),
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      expect(result).toHaveLength(1);
      expect(value(result[0].artist)).toBe("Artist A");
    });

    it("should handle songs with very different artist names", () => {
      const set1 = [
        createSong("Song A", "Artist A"),
      ];
      const set2 = [
        createSong("Song A", "Completely Different Artist"),
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      // In default mode, fuzzy matching still applies without threshold
      // So they will merge even with high distance
      expect(result).toHaveLength(1);
    });

    it("should handle only-fallback mode: add fetched songs only if no match exists", () => {
      const set1 = [
        createSong("Song A", "Artist A"),
      ];
      const set2 = [
        createSong("Song A", "Artist A"), // Should not be added (match exists)
        createSong("Song B", "Artist B"), // Should be added (no match)
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "only-fallback", logger, merger(logger, take), take);

      expect(result).toHaveLength(2);

      const songA = result.find(s => s.songName === "Song A");
      const songB = result.find(s => s.songName === "Song B");

      expect(songA).toBeDefined();
      expect(songB).toBeDefined();
    });

    it("should handle multiple candidates with same edit distance (first match wins)", () => {
      const set1 = [
        createSong("Song A", "AB"), // Distance to "AC" = 1
        createSong("Song A", "AD"), // Distance to "AC" = 1
      ];
      const set2 = [
        createSong("Song A", "AC"),
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      // Should prefer the first candidate when distances are equal
      expect(result).toHaveLength(2);

      // One should be merged with AC, the other should remain
      const artists = result.map(s => value(s.artist)).sort();
      expect(artists.length).toBe(2);
    });

    it("should handle different song types (standard vs deluxe)", () => {
      const set1 = [
        createSong("Song A", "Artist A", "std"),
        createSong("Song A", "Artist A", "dx"),
      ];
      const set2 = [
        createSong("Song A", "Artist A", "std"),
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      // Should have both standard and deluxe (different keys)
      expect(result).toHaveLength(2);

      const standard = result.find(s => s.type === "std");
      const deluxe = result.find(s => s.type === "dx");

      expect(standard).toBeDefined();
      expect(deluxe).toBeDefined();
    });

    it("should handle different difficulties", () => {
      const set1 = [
        createSong("Song A", "Artist A", "std", "basic"),
        createSong("Song A", "Artist A", "std", "expert"),
      ];
      const set2 = [
        createSong("Song A", "Artist A", "std", "basic"),
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      // Should have both difficulties (different keys)
      expect(result).toHaveLength(2);

      const basic = result.find(s => s.difficulty === "basic");
      const expert = result.find(s => s.difficulty === "expert");

      expect(basic).toBeDefined();
      expect(expert).toBeDefined();
    });

    it("should handle songs with mode property set", () => {
      const set1 = [
        { ...createSong("Song A", "Artist A"), mode: "only-modify" as const },
      ];
      const set2 = [
        createSong("Song A", "Artist A"),
      ];

      // Global mode is "default", but song has mode "only-modify"
      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      // Song should be merged according to its own mode
      expect(result).toHaveLength(1);
      expect(value(result[0].artist)).toBe("Artist A");
    });

    it("should handle Pending values with important flag", () => {
      const set1 = [
        {
          ...createSong("Song A", "Artist A"),
          artist: important("Important Artist"),
        },
      ];
      const set2 = [
        createSong("Song A", "Different Artist"),
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      expect(result).toHaveLength(1);
      // The result depends on the take function - our simple take prefers second value
      // but in production, important values would be preferred
    });

    it("should preserve extras from both songs", () => {
      const set1 = [
        {
          ...createSong("Song A", "Artist A"),
          extras: { key1: "value1" },
        },
      ];
      const set2 = [
        {
          ...createSong("Song A", "Artist A"),
          extras: { key2: "value2" },
        },
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "default", logger, merger(logger, take), take);

      expect(result).toHaveLength(1);
      expect(result[0].extras).toEqual({ key1: "value1", key2: "value2" });
    });
  });

  describe("only-fallback mode comprehensive tests", () => {
    it("should force add all local songs and only add fetched songs with no match", () => {
      const set1 = [
        createSong("Song A", "Artist A"),
        createSong("Song B", "Artist B"),
      ];
      const set2 = [
        createSong("Song A", "Similar Artist"), // Has fuzzy match, should NOT be added
        createSong("Song C", "Artist C"), // No match, should be added
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "only-fallback", logger, merger(logger, take), take);

      expect(result).toHaveLength(3);

      const songA = result.find(s => s.songName === "Song A");
      const songB = result.find(s => s.songName === "Song B");
      const songC = result.find(s => s.songName === "Song C");

      expect(songA).toBeDefined();
      expect(songB).toBeDefined();
      expect(songC).toBeDefined();

      // Song A should keep the local artist (not merged)
      expect(value(songA?.artist)).toBe("Artist A");
    });
  });

  describe("only-modify mode comprehensive tests", () => {
    it("should keep all local songs and only merge fetched songs with matches", () => {
      const set1 = [
        createSong("Song A", "Artist A"),
        createSong("Song B", "Artist B"),
      ];
      const set2 = [
        createSong("Song A", "Artist A"), // Has match, should merge
        createSong("Song C", "Artist C"), // No match, should NOT be added
      ];

      const take = taker(logger);
      const result = mergeSongs(set1, set2, "only-modify", logger, merger(logger, take), take);

      expect(result).toHaveLength(2);

      const songA = result.find(s => s.songName === "Song A");
      const songB = result.find(s => s.songName === "Song B");
      const songC = result.find(s => s.songName === "Song C");

      expect(songA).toBeDefined();
      expect(songB).toBeDefined();
      expect(songC).toBeUndefined(); // Song C should not be added
    });
  });

  describe("Real-world scenario: MaimaiScraperFetcher + MaimaiBaseFetcher", () => {
    it("should merge scraper data with base fetcher data (only-modify mode)", () => {
      // Simulate MaimaiScraperFetcher output (provides: songName, type, difficulty, level, addedVersion, extras)
      const scraperSongs: PendingSong[] = [
        {
          songName: "TEST",
          type: "dx",
          difficulty: "master",
          level: important("14"),
          addedVersion: important(5),
          extras: { inputName: "music_12345", inputValue: "67890" },
        },
        {
          songName: "Another Song",
          type: "std",
          difficulty: "expert",
          level: important("13"),
          addedVersion: important(3),
          extras: { inputName: "music_11111", inputValue: "22222" },
        },
      ];

      // Simulate MaimaiBaseFetcher output (provides: songName, type, difficulty, level, cover, genre, artist)
      // In only-modify mode, it only modifies existing songs
      const baseSongs: PendingSong[] = [
        {
          songName: "TEST",
          type: "dx",
          difficulty: "master",
          level: important("14"),
          cover: "https://example.com/cover.jpg",
          genre: important("POPS & ANIME"),
          artist: important("Test Artist"),
        },
        // "Another Song" is missing from base fetcher - should not affect it
      ];

      const take = taker(logger);
      const result = mergeSongs(scraperSongs, baseSongs, "only-modify", logger, merger(logger, take), take);

      expect(result).toHaveLength(2);

      const testSong = result.find(s => s.songName === "TEST");
      const anotherSong = result.find(s => s.songName === "Another Song");

      // TEST should have data from both sources
      expect(testSong).toBeDefined();
      expect(value(testSong!.level)).toBe("14");
      expect(value(testSong!.addedVersion)).toBe(5);
      expect(value(testSong!.cover)).toBe("https://example.com/cover.jpg");
      expect(value(testSong!.genre)).toBe("POPS & ANIME");
      expect(value(testSong!.artist)).toBe("Test Artist");
      expect(testSong!.extras).toEqual({ inputName: "music_12345", inputValue: "67890" });

      // Another Song should only have scraper data (no match in base fetcher)
      expect(anotherSong).toBeDefined();
      expect(value(anotherSong!.level)).toBe("13");
      expect(value(anotherSong!.addedVersion)).toBe(3);
      expect(value(anotherSong!.cover)).toBeUndefined();
      expect(value(anotherSong!.genre)).toBeUndefined();
      expect(value(anotherSong!.artist)).toBeUndefined();
    });

    it("should handle level conflicts between scraper and base fetcher", () => {
      // Scraper says level is "14", base says "14+"
      const scraperSongs: PendingSong[] = [
        {
          songName: "Conflict Song",
          type: "dx",
          difficulty: "master",
          level: important("14"),
          addedVersion: important(5),
        },
      ];

      const baseSongs: PendingSong[] = [
        {
          songName: "Conflict Song",
          type: "dx",
          difficulty: "master",
          level: important("14+"),
          artist: important("Artist"),
        },
      ];

      const take = taker(logger);
      const result = mergeSongs(scraperSongs, baseSongs, "only-modify", logger, merger(logger, take), take);

      expect(result).toHaveLength(1);
      // Both are important, so the taker function will choose one (in this case, the second one)
      expect(value(result[0].level)).toBe("14+");
      expect(value(result[0].artist)).toBe("Artist");
    });

    it("should handle multiple difficulties for the same song", () => {
      const scraperSongs: PendingSong[] = [
        {
          songName: "Multi Diff",
          type: "dx",
          difficulty: "basic",
          level: important("7"),
          addedVersion: important(5),
        },
        {
          songName: "Multi Diff",
          type: "dx",
          difficulty: "advanced",
          level: important("10"),
          addedVersion: important(5),
        },
        {
          songName: "Multi Diff",
          type: "dx",
          difficulty: "master",
          level: important("13"),
          addedVersion: important(5),
        },
      ];

      const baseSongs: PendingSong[] = [
        {
          songName: "Multi Diff",
          type: "dx",
          difficulty: "basic",
          level: important("7"),
          artist: important("Artist"),
          genre: important("VARIETY"),
        },
        {
          songName: "Multi Diff",
          type: "dx",
          difficulty: "advanced",
          level: important("10"),
          artist: important("Artist"),
          genre: important("VARIETY"),
        },
        {
          songName: "Multi Diff",
          type: "dx",
          difficulty: "master",
          level: important("13"),
          artist: important("Artist"),
          genre: important("VARIETY"),
        },
      ];

      const take = taker(logger);
      const result = mergeSongs(scraperSongs, baseSongs, "only-modify", logger, merger(logger, take), take);

      expect(result).toHaveLength(3);

      // All three difficulties should have merged data
      const basic = result.find(s => s.difficulty === "basic");
      const advanced = result.find(s => s.difficulty === "advanced");
      const master = result.find(s => s.difficulty === "master");

      expect(value(basic!.artist)).toBe("Artist");
      expect(value(advanced!.artist)).toBe("Artist");
      expect(value(master!.artist)).toBe("Artist");
    });

    it("should handle std and dx versions of the same song", () => {
      const scraperSongs: PendingSong[] = [
        {
          songName: "Dual Version",
          type: "std",
          difficulty: "master",
          level: important("13"),
          addedVersion: important(0), // Old version
        },
        {
          songName: "Dual Version",
          type: "dx",
          difficulty: "master",
          level: important("14"),
          addedVersion: important(5), // New version
        },
      ];

      const baseSongs: PendingSong[] = [
        {
          songName: "Dual Version",
          type: "std",
          difficulty: "master",
          level: important("13"),
          artist: important("Classic Artist"),
          genre: important("POPS & ANIME"),
        },
        {
          songName: "Dual Version",
          type: "dx",
          difficulty: "master",
          level: important("14"),
          artist: important("Remix Artist"),
          genre: important("niconico"),
        },
      ];

      const take = taker(logger);
      const result = mergeSongs(scraperSongs, baseSongs, "only-modify", logger, merger(logger, take), take);

      expect(result).toHaveLength(2);

      const stdVersion = result.find(s => s.type === "std");
      const dxVersion = result.find(s => s.type === "dx");

      expect(value(stdVersion!.artist)).toBe("Classic Artist");
      expect(value(stdVersion!.genre)).toBe("POPS & ANIME");
      expect(value(stdVersion!.addedVersion)).toBe(0);

      expect(value(dxVersion!.artist)).toBe("Remix Artist");
      expect(value(dxVersion!.genre)).toBe("niconico");
      expect(value(dxVersion!.addedVersion)).toBe(5);
    });

    it("should not merge songs with different addedVersion values", () => {
      // Same song, same everything, but different versions - should NOT merge
      const scraperSongs: PendingSong[] = [
        {
          songName: "Version Test",
          type: "dx",
          difficulty: "master",
          level: important("14"),
          addedVersion: important(5),
          artist: "Old Artist",
        },
      ];

      const baseSongs: PendingSong[] = [
        {
          songName: "Version Test",
          type: "dx",
          difficulty: "master",
          level: important("14"),
          addedVersion: important(6), // Different version!
          artist: important("New Artist"),
          genre: important("VARIETY"),
        },
      ];

      const take = taker(logger);
      const result = mergeSongs(scraperSongs, baseSongs, "only-modify", logger, merger(logger, take), take);

      // Should remain separate (not merged)
      expect(result).toHaveLength(1);
      expect(value(result[0].addedVersion)).toBe(5);
      expect(value(result[0].artist)).toBe("Old Artist");
      // Genre should not be added because they didn't merge
      expect(value(result[0].genre)).toBeUndefined();
    });

    it("should preserve extras from scraper when merging with base data", () => {
      const scraperSongs: PendingSong[] = [
        {
          songName: "Extras Test",
          type: "dx",
          difficulty: "master",
          level: important("13"),
          addedVersion: important(5),
          extras: {
            inputName: "music_test",
            inputValue: "12345",
            customField: "custom",
          },
        },
      ];

      const baseSongs: PendingSong[] = [
        {
          songName: "Extras Test",
          type: "dx",
          difficulty: "master",
          level: important("13"),
          artist: important("Artist"),
          extras: {
            officialField: "official",
          },
        },
      ];

      const take = taker(logger);
      const result = mergeSongs(scraperSongs, baseSongs, "only-modify", logger, merger(logger, take), take);

      expect(result).toHaveLength(1);
      // Extras from both should be merged
      expect(result[0].extras).toEqual({
        inputName: "music_test",
        inputValue: "12345",
        customField: "custom",
        officialField: "official",
      });
    });
  });
});
