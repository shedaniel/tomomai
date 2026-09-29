import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getTableColumns } from "drizzle-orm";
import { userSnapshots } from "@/lib/db/schema-pg";

const db = vi.hoisted(() => ({ statements: [] as { sql: string; params: unknown[] }[], responses: [] as unknown[][][] }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => { db.statements.push({ sql, params }); return { rows: db.responses.shift() ?? [] }; }) };
});
vi.mock("@/lib/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.context<{ session: { user: { id: string } } }>().create();
  return { router: t.router, protectedProcedure: t.procedure, publicProcedure: t.procedure };
});
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }));
vi.mock("@/lib/r2", () => ({ deleteFromR2: vi.fn(), isR2IconUrl: () => false, r2KeyFromIconUrl: vi.fn() }));
const services = vi.hoisted(() => ({ copy: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/profile-cache", () => ({ revalidatePublicProfileForUser: services.revalidate }));
vi.mock("@/server/services/games/snapshot-copy", () => ({ copySnapshotToVersion: services.copy }));

import { snapshotsRouter } from "./snapshots";

beforeEach(() => {
  db.statements = [];
  db.responses = [];
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp");
});
afterEach(() => vi.unstubAllEnvs());

function caller() {
  const now = new Date();
  return snapshotsRouter.createCaller({
    req: new NextRequest("http://localhost/api/trpc"),
    session: {
      user: { id: "same-owner", createdAt: now, updatedAt: now, email: "owner@example.test", emailVerified: true, name: "Owner", banned: false },
      session: { id: "session", userId: "same-owner", token: "test", createdAt: now, updatedAt: now, expiresAt: now },
    },
  });
}

it("scopes the export lookup to the requested game and owner before reading scores", async () => {
  await expect(caller().exportSnapshotData({ game: "maimai", snapshotId: "other-game-snapshot" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(db.statements).toHaveLength(1);
  const [query] = db.statements;
  expect(query.sql).toContain('"user_snapshots"."game" = $');
  expect(query.sql).toContain('"user_snapshots"."userId" = $');
  expect(query.params).toEqual(["other-game-snapshot", "maimai", "same-owner", 1]);
});

it.each([
  { region: "cn", gameVersion: 11, addedVersions: [-9, 1], snapshotName: "maimai DX PRiSM PLUS", songNames: ["ORANGE", "DX PLUS"] },
  { region: "intl", gameVersion: 13, addedVersions: [14], snapshotName: "maimai DX CiRCLE PLUS", songNames: ["MAGiCAL"] },
])("labels $region export versions that were never released in the snapshot region", async ({ region, gameVersion, addedVersions, snapshotName, songNames }) => {
  const snapshot: Partial<typeof userSnapshots.$inferSelect> = {
    id: 1, publicId: "snapshot", userId: "same-owner", game: "maimai", region: region as "cn" | "intl", gameVersion, rating: 15000,
    versionPlayCount: 0, totalPlayCount: 0, iconUrl: "", displayName: "Player", title: "Title", titleType: 0,
  };
  db.responses.push(
    [Object.keys(getTableColumns(userSnapshots)).map(column => snapshot[column as keyof typeof snapshot] ?? null)],
    addedVersions.map((addedVersion, index) => [`Song ${index}`, "Artist", "", 3, "13", 130, 0, addedVersion, 1000000 - index, 0, 0, 0]),
  );
  const exported = await caller().exportSnapshotData({ game: "maimai", snapshotId: "snapshot" });
  expect(exported.metadata.gameVersion).toBe(snapshotName);
  expect(exported.songs.map(song => song.gameVersion)).toEqual(songNames);
});

it("exports scores in rating order with each chart's integer rating and legacy keys", async () => {
  const snapshot: Partial<typeof userSnapshots.$inferSelect> = {
    id: 1, publicId: "snapshot", userId: "same-owner", game: "maimai", region: "jp", gameVersion: 12, rating: 15000,
    versionPlayCount: 0, totalPlayCount: 0, iconUrl: "", displayName: "Player", title: "Title", titleType: 0,
  };
  db.responses.push(
    [Object.keys(getTableColumns(userSnapshots)).map(column => snapshot[column as keyof typeof snapshot] ?? null)],
    [
      ["C", "Artist", "", 3, "13", 131, 0, 12, 1000000, 0, 0, 0],
      ["B", "Artist", "", 3, "13", 130, 1, 12, 1005000, 0, 0, 0],
      ["A", "Artist", "", 3, "13", 130, 1, 12, 1005000, 0, 3, 5],
    ],
  );
  const exported = await caller().exportSnapshotData({ game: "maimai", snapshotId: "snapshot" });
  expect(exported.songs.map(song => [song.songName, song.rating, song.difficulty, song.type, song.fc, song.fs])).toEqual([
    ["A", 293, "master", "dx", "ap", "fdx+"],
    ["B", 292, "master", "dx", "none", "none"],
    ["C", 282, "master", "std", "none", "none"],
  ]);
});

it("answers NOT_FOUND for a snapshot the copy service cannot find, without revalidating", async () => {
  services.copy.mockResolvedValueOnce(null);
  await expect(caller().copySnapshotToVersion({ game: "maimai", snapshotId: "missing", region: "jp", targetVersion: 13 }))
    .rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(services.copy).toHaveBeenCalledWith({ game: "maimai", userId: "same-owner", snapshotPublicId: "missing", region: "jp", targetVersion: 13 });
  expect(services.revalidate).not.toHaveBeenCalled();
});

it("revalidates the public profile once the copy has committed", async () => {
  const copied = { newSnapshotId: "copy", copiedScores: 1, totalOriginalScores: 2, originalRating: 12000, newRating: 12100 };
  services.copy.mockResolvedValueOnce(copied);
  await expect(caller().copySnapshotToVersion({ game: "maimai", snapshotId: "source", region: "jp", targetVersion: 13 }))
    .resolves.toEqual({ success: true, ...copied });
  expect(services.revalidate).toHaveBeenCalledWith("maimai", "same-owner", ["jp"]);
});
