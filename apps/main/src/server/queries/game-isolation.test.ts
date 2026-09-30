import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalGameId } from "@/lib/games/types";
import type { ProxyRow } from "@/test/pg-proxy";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/r2", () => ({ deleteFromR2: vi.fn(), isR2IconUrl: () => false, r2KeyFromIconUrl: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }));

import { fetchUserSnapshots, deleteUserSnapshot } from "./snapshots";
import { fetchRecentSongs } from "./recents";
import { fetchUserAlbums } from "./albums";
import { fetchPlayerStats } from "./stats";

const OWNER = "owner";
const SNAPSHOT_ID = 41;
const chart = { songId: "Ab3xK9pQ:j9", songName: "Song", artist: "Artist", cover: null, difficultyCode: 3, typeCode: 0, level: "14", levelPrecise: 140 };
const rootRows: Record<string, ProxyRow[]> = {
  user_snapshots: [{
    id: SNAPSHOT_ID, publicId: "snapshot", fetchedAt: "2026-09-01 00:00:00", rating: 1700, displayName: "Player", gameVersion: 9,
    courseRankUrl: null, classRankUrl: null, stars: null, versionPlayCount: 1, totalPlayCount: 2, iconUrl: "",
  }],
  user_recent_songs: [{
    ...chart, recentSongId: "1", playedAt: "2026-09-01 00:00:00", scoreValue: 1009000, secondaryScore: null, comboStatus: 0,
    syncStatus: 0, clearStatus: 1, maxSecondaryScore: null, metadata: null, track: 1, genre: "Original",
  }],
  user_albums: [{
    ...chart, id: "7", takenAt: "2026-09-01 00:00:00", imageKey: "albums/7.jpg", imageSize: 100, venue: "Arcade", createdAt: "2026-09-01 00:00:00",
  }],
};

// Rows of the stored game answer only a query that names their owner and game, as the root-row predicates do.
function storeFor(game: CanonicalGameId) {
  proxy.answer(({ sql, table, params }) => {
    const owned = params.includes(OWNER) && params.includes(game);
    if (sql.startsWith("select count(")) return [{ totalCount: owned ? 1 : 0 }];
    if (table === "snapshot_scores") {
      return params.includes(SNAPSHOT_ID) ? [{ scoreValue: 1009000, addedVersion: 9, difficulty: 3, comboStatus: 0, syncStatus: 0, clearStatus: 1 }] : [];
    }
    return owned && table ? rootRows[table] : [];
  });
}

beforeEach(() => proxy.reset());

describe.each([
  { game: "maimai", other: "chunithm" },
  { game: "chunithm", other: "maimai" },
] as const)("$game rows", ({ game, other }) => {
  beforeEach(() => storeFor(game));

  it("list and delete only as the owner's snapshots of the game", async () => {
    await expect(fetchUserSnapshots(game, OWNER, "jp")).resolves.toHaveLength(1);
    await expect(fetchUserSnapshots(other, OWNER, "jp")).resolves.toEqual([]);
    await expect(fetchUserSnapshots(game, "stranger", "jp")).resolves.toEqual([]);
    await expect(deleteUserSnapshot(other, OWNER, "snapshot", "jp")).resolves.toEqual({ deleted: false });
    await expect(deleteUserSnapshot(game, "stranger", "snapshot", "jp")).resolves.toEqual({ deleted: false });
    await expect(deleteUserSnapshot(game, OWNER, "snapshot", "jp")).resolves.toEqual({ deleted: true });
  });

  it("page as the owner's recent plays and albums of the game", async () => {
    await expect(fetchRecentSongs(game, OWNER, "jp", 20, 0)).resolves.toMatchObject({ recentPlays: [{ songId: chart.songId }], totalCount: 1 });
    await expect(fetchRecentSongs(other, OWNER, "jp", 20, 0)).resolves.toMatchObject({ recentPlays: [], totalCount: 0 });
    await expect(fetchUserAlbums(game, OWNER, "jp", 20, 0)).resolves.toMatchObject({ albums: [{ id: "7", songId: chart.songId }] });
    await expect(fetchUserAlbums(other, OWNER, "jp", 20, 0)).resolves.toMatchObject({ albums: [] });
    await expect(fetchUserAlbums(game, "stranger", "jp", 20, 0)).resolves.toMatchObject({ albums: [] });
  });

  it("count as the owner's stats only through their snapshot of the game", async () => {
    const own = await fetchPlayerStats(game, OWNER, "jp");
    expect(own.stats[9][3].total).toBe(1);
    await expect(fetchPlayerStats(other, OWNER, "jp")).resolves.toEqual({ stats: {}, totalSongs: {} });
  });
});
