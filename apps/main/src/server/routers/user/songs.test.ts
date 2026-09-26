import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SongDetails, UniqueSong } from "@/components/db/songs/types";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/song-slug", () => ({ getSongSlug: vi.fn() }));
vi.mock("@/lib/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.context<{ session: { user: { id: string } } }>().create();
  return { router: t.router, protectedProcedure: t.procedure, publicProcedure: t.procedure };
});
vi.mock("@/server/queries/songs", () => ({
  queryAllUniqueSongs: vi.fn(), querySongDetails: vi.fn(), querySongScores: vi.fn(),
}));
vi.mock("@/server/queries/songs-cache", () => ({ getCatalogChartsCached: vi.fn() }));

import { queryAllUniqueSongs, querySongDetails, querySongScores } from "@/server/queries/songs";
import { getCatalogChartsCached } from "@/server/queries/songs-cache";
import { songsRouter } from "./songs";

const song: UniqueSong = {
  parentIds: ["abcdefgh"], index: 0, songName: "Test song", artist: "Artist",
  cover: "", type: "standard", genre: "Original", addedVersion: 1,
  slug: "test-song", aliases: [], difficulties: [],
};
const details: SongDetails = { ...song, bpm: 180, regions: [] };
const now = new Date();
const caller = songsRouter.createCaller({
  req: new NextRequest("http://localhost/api/trpc"),
  session: {
    user: { id: "viewer", createdAt: now, updatedAt: now, email: "viewer@example.test", emailVerified: true, name: "Viewer", banned: false },
    session: { id: "session", userId: "viewer", token: "test", createdAt: now, updatedAt: now, expiresAt: now },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", undefined);
  vi.mocked(queryAllUniqueSongs).mockResolvedValue([song]);
  vi.mocked(querySongDetails).mockResolvedValue(details);
  vi.mocked(getCatalogChartsCached).mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe("catalog access before player rollout", () => {
  it("serves the CHUNITHM list and regional catalog", async () => {
    expect(await caller.getAllUniqueSongs({ game: "chunithm" })).toEqual([song]);
    expect(queryAllUniqueSongs).toHaveBeenCalledWith("chunithm");
    expect(await caller.getCatalog({ game: "chunithm", region: "jp" })).toEqual([]);
    expect(getCatalogChartsCached).toHaveBeenCalledWith("chunithm", "jp", undefined);
  });

  it("serves details without player enrichment while preserving maimai enrichment", async () => {
    const input = { songName: song.songName, type: song.type, artist: song.artist };
    expect(await caller.getSongDetails({ game: "chunithm", ...input })).toEqual(details);
    expect(querySongDetails).toHaveBeenLastCalledWith("chunithm", input.songName, input.type, undefined, input.artist, undefined);
    await caller.getSongDetails({ game: "maimai", ...input, type: "std" });
    expect(querySongDetails).toHaveBeenLastCalledWith("maimai", input.songName, "std", "viewer", input.artist, undefined);
  });

  it("rejects player score reads before querying storage", async () => {
    await expect(caller.getSongScores({ game: "chunithm", songName: song.songName, type: song.type }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", cause: { code: "GAME_NOT_ENABLED" } });
    expect(querySongScores).not.toHaveBeenCalled();
  });
});
