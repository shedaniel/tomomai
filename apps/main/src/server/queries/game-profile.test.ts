import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), latest: vi.fn(), fullSnapshot: vi.fn(), reserved: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("./public-access", () => ({ resolvePublicUserByUsername: mocks.user }));
vi.mock("./latest-snapshot", () => ({ latestSnapshot: mocks.latest }));
vi.mock("./snapshots", async importOriginal => ({
  ...await importOriginal<typeof import("./snapshots")>(),
  fetchLatestSnapshotData: mocks.fullSnapshot,
}));
vi.mock("@/server/services/games/registry", () => ({ GAME_SERVER_MODULES: {
  maimai: { reserved: { snapshot: mocks.reserved } },
  chunithm: {},
} }));

import { fetchPublicGameProfileHeader } from "./game-profile";
import { gameSnapshotColumns } from "./snapshots";

const header = {
  publicId: "snapshot", game: "chunithm", displayName: "Player", rating: 1650, gameVersion: 9, fetchedAt: new Date(0),
  title: "Title", titleType: 0, iconUrl: "", courseRankUrl: null, classRankUrl: null, stars: null, versionPlayCount: 10, totalPlayCount: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", undefined);
  mocks.user.mockResolvedValue({ id: "owner", profileShowPlayCounts: false });
});
afterEach(() => vi.unstubAllEnvs());

it("reads only the public header of the latest snapshot, under the owner's privacy settings", async () => {
  mocks.latest.mockResolvedValueOnce(header);
  const { snapshot } = await fetchPublicGameProfileHeader("chunithm", "player", "jp");
  expect(mocks.user).toHaveBeenCalledWith("chunithm", "player");
  expect(mocks.latest).toHaveBeenCalledWith("chunithm", "owner", "jp", gameSnapshotColumns);
  expect(mocks.fullSnapshot).not.toHaveBeenCalled();
  expect(snapshot).toEqual({ ...header, versionPlayCount: null, totalPlayCount: null });
});

it("reads a reserved profile's header from its provider", async () => {
  mocks.reserved.mockResolvedValueOnce({ snapshot: { ...header, game: "maimai" }, songs: [] });
  const { snapshot } = await fetchPublicGameProfileHeader("maimai", "max", "jp");
  expect(mocks.reserved).toHaveBeenCalledWith("max", "jp");
  expect(mocks.latest).not.toHaveBeenCalled();
  expect(snapshot).toMatchObject({ game: "maimai", displayName: "Player" });
});
