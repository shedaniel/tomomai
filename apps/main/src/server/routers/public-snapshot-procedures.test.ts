import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ProfilePrivacySettings } from "@/lib/types";
import type { ProxyRow } from "@/test/pg-proxy";

type Privacy = Pick<ProfilePrivacySettings, "profileShowAllScores" | "profileShowScoreDetails" | "profileShowPlates" | "profileShowPlayCounts" | "profileShowEvents">;
const SHARED: Privacy = { profileShowAllScores: true, profileShowScoreDetails: true, profileShowPlates: true, profileShowPlayCounts: true, profileShowEvents: true };

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }), error: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: proxy.db }));

import { router } from "@/lib/trpc";
import { statsRouter } from "./user/stats";
import { recentsRouter } from "./user/recents";
import { platesRouter } from "./maimai/plates";
import { dailyPlaysRouter } from "./maimai/daily-plays";

const caller = router({
  stats: statsRouter.getPublicPlayerStats,
  recents: recentsRouter.getPublicRecentSongs,
  plates: platesRouter.getPublicPlateSongs,
  days: dailyPlaysRouter.getPublicAvailableDays,
}).createCaller({ session: null, req: new NextRequest("http://localhost/api/trpc") });

const stored = { snapshot: null as ProxyRow | null, scores: [] as ProxyRow[], catalog: [] as ProxyRow[] };

function publish(privacy: Partial<Privacy> = {}, region = "jp") {
  stored.snapshot = { userId: "owner", snapshotInternalId: 41, gameVersion: 13, region, privacy: { ...SHARED, ...privacy } };
}

/** The queries after the access check, which is always the first one. */
function dataQueries() {
  return proxy.queries.slice(1);
}

beforeEach(() => {
  proxy.reset();
  Object.assign(stored, { snapshot: null, scores: [], catalog: [] });
  // The snapshot's scores answer only a read of its id, and the catalog only a read of the game's catalog in its region and version.
  proxy.answer(({ sql, table, params }) => {
    if (table === "user_snapshots") return stored.snapshot ? [stored.snapshot] : [];
    if (sql.startsWith("select count(")) return [{ totalCount: 0 }];
    if (table === "snapshot_scores") return params.includes(41) ? stored.scores : [];
    const snapshot = stored.snapshot;
    if (table === "songs" && snapshot) return ["maimai", snapshot.region, snapshot.gameVersion].every(value => params.includes(value)) ? stored.catalog : [];
  });
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_REGIONS", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("public snapshot access", () => {
  // A fake cannot evaluate the owner's profile flags, so the access query itself is the contract.
  it("reads only a snapshot of the game whose owner publishes a listed profile", async () => {
    publish();
    await caller.days({ snapshotId: "snapshot" });
    const [access] = proxy.queries;
    expect(access.sql).toContain('"user_snapshots"."game" = $1');
    expect(access.sql).toContain('"user"."publishProfile" = $3');
    expect(access.sql).toContain('"user"."profileShowInSearch" = $4');
    expect(access.params).toEqual(["maimai", "snapshot", true, true, 1]);
  });

  it("answers NOT_FOUND for a missing or unpublished snapshot without reading any data", async () => {
    await expect(caller.days({ snapshotId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dataQueries()).toEqual([]);
  });

  it("checks the capability in the snapshot's own region", async () => {
    publish({}, "intl");
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp");
    await expect(caller.days({ snapshotId: "snapshot" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dataQueries()).toEqual([]);
  });
});

describe("getPublicPlayerStats", () => {
  it("is hidden unless the owner shares all scores", async () => {
    publish({ profileShowAllScores: false });
    await expect(caller.stats({ game: "maimai", snapshotId: "snapshot" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dataQueries()).toEqual([]);
  });

  it("counts the snapshot's scores against its own region's catalog", async () => {
    publish({}, "intl");
    stored.scores = [{ scoreValue: 1005000, addedVersion: 13, difficulty: 3, comboStatus: 3, syncStatus: 4, clearStatus: 0 }];
    stored.catalog = [{ addedVersion: 13, difficulty: 3, count: 10 }];
    const result = await caller.stats({ game: "maimai", snapshotId: "snapshot" });
    expect(result.stats[13][3].statuses).toEqual({ comboStatus: { 3: 1 }, syncStatus: { 4: 1 } });
    expect(result.totalSongs).toEqual({ 13: { 3: 10 } });
  });

  it("leaves out combo and sync counts unless the owner shares score details", async () => {
    publish({ profileShowScoreDetails: false });
    stored.scores = [{ scoreValue: 1005000, addedVersion: 13, difficulty: 3, comboStatus: 3, syncStatus: 4, clearStatus: 0 }];
    const result = await caller.stats({ game: "maimai", snapshotId: "snapshot" });
    expect(result.stats[13][3]).toEqual({ grades: { "SSS+": 1 }, statuses: {}, total: 1 });
  });
});

describe("getPublicRecentSongs", () => {
  it("is hidden unless the owner shares score details", async () => {
    publish({ profileShowScoreDetails: false });
    await expect(caller.recents({ game: "maimai", snapshotId: "snapshot" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dataQueries()).toEqual([]);
  });

  it("reads the snapshot owner's plays in the snapshot's region", async () => {
    publish({}, "intl");
    await expect(caller.recents({ game: "maimai", snapshotId: "snapshot" })).resolves.toMatchObject({ recentPlays: [], totalCount: 0 });
    expect(dataQueries()[0].params).toEqual(expect.arrayContaining(["maimai", "owner", "intl"]));
  });
});

describe("getPublicPlateSongs", () => {
  const plate = { snapshotId: "snapshot", version: "13", difficulty: "master", plateType: "kiwami" } as const;

  it.each([
    ["plates", { profileShowPlates: false }],
    ["score details", { profileShowScoreDetails: false }],
    ["all scores", { profileShowAllScores: false }],
  ] as const)("is hidden unless the owner shares %s", async (_, privacy) => {
    publish(privacy);
    await expect(caller.plates(plate)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dataQueries()).toEqual([]);
  });

  it("evaluates the snapshot in its own region", async () => {
    publish({}, "intl");
    await expect(caller.plates(plate)).resolves.toEqual([]);
    expect(dataQueries()[0].params).toEqual(expect.arrayContaining([41, "intl", 13]));
  });
});

describe("getPublicDailyPlaysAvailableDays", () => {
  it("is hidden unless the owner shares score details", async () => {
    publish({ profileShowScoreDetails: false });
    await expect(caller.days({ snapshotId: "snapshot" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dataQueries()).toEqual([]);
  });

  it("lists the snapshot owner's play days in the snapshot's region", async () => {
    publish({}, "intl");
    await expect(caller.days({ snapshotId: "snapshot" })).resolves.toEqual([]);
    expect(dataQueries()[0].params).toEqual(["maimai", "owner", "intl"]);
  });
});
