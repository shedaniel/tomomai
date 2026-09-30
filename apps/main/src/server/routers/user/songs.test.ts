import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SongDetails } from "@/components/db/songs/types";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/song-slug", () => ({ getSongSlug: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ warn: vi.fn(), error: vi.fn() }) } }));
vi.mock("@/server/queries/songs", () => ({ querySongDetails: vi.fn(), querySongScores: vi.fn() }));

import { querySongDetails, querySongScores } from "@/server/queries/songs";
import { songsRouter } from "./songs";

const details: SongDetails = {
  parentIds: ["abcdefgh"], songName: "Test song", artist: "Artist", cover: "", type: "standard", genre: "Original",
  addedVersion: 1, bpm: 180, regions: [],
};
const song = details;
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
  vi.mocked(querySongDetails).mockResolvedValue(details);
});
afterEach(() => vi.unstubAllEnvs());

describe("catalog and player access", () => {
  it("reads the signed-in viewer's scores only where the game offers them", async () => {
    const input = { songName: song.songName, type: song.type, artist: song.artist };
    await caller.getSongDetails({ game: "chunithm", ...input });
    expect(querySongDetails).toHaveBeenLastCalledWith(expect.objectContaining({ game: "chunithm", userId: "viewer" }));

    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", "");
    await caller.getSongDetails({ game: "chunithm", ...input });
    expect(querySongDetails).toHaveBeenLastCalledWith(expect.objectContaining({ game: "chunithm", userId: undefined }));
    await expect(caller.getSongScores({ game: "chunithm", ...input })).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    expect(querySongScores).not.toHaveBeenCalled();
  });

  it("rejects a chart type the game does not have before querying", async () => {
    await expect(caller.getSongDetails({ game: "chunithm", songName: song.songName, type: "std" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.getSongScores({ game: "maimai", songName: song.songName, type: "standard" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(querySongDetails).not.toHaveBeenCalled();
    expect(querySongScores).not.toHaveBeenCalled();
  });
});
