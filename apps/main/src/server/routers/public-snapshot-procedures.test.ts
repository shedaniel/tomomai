import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ProfilePrivacySettings } from "@/lib/types";

type Privacy = Pick<ProfilePrivacySettings, "profileShowAllScores" | "profileShowScoreDetails" | "profileShowPlates" | "profileShowPlayCounts" | "profileShowEvents">;
const SHARED: Privacy = { profileShowAllScores: true, profileShowScoreDetails: true, profileShowPlates: true, profileShowPlayCounts: true, profileShowEvents: true };

const db = vi.hoisted(() => ({
  queries: [] as { table: string | undefined; sql: string; params: unknown[] }[],
  snapshot: null as null | { region: string; privacy: Privacy },
  scores: [] as unknown[][],
}));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }), error: vi.fn() } }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    const table = /^select .*? from "(\w+)"/.exec(sql)?.[1];
    db.queries.push({ table, sql, params });
    if (table === "user_snapshots") {
      if (!db.snapshot) return { rows: [] };
      return { rows: [["owner", 41, 13, db.snapshot.region, ...Object.values(db.snapshot.privacy)]] };
    }
    if (sql.startsWith("select count(*)")) return { rows: [[0]] };
    if (table === "snapshot_scores") return { rows: db.scores };
    return { rows: [] };
  }) };
});

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

function publish(privacy: Partial<Privacy> = {}, region = "jp") {
  db.snapshot = { region, privacy: { ...SHARED, ...privacy } };
}

/** The queries after the access check, which is always the first one. */
function dataQueries() {
  return db.queries.slice(1);
}

beforeEach(() => {
  db.queries = [];
  db.snapshot = null;
  db.scores = [];
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_REGIONS", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("public snapshot access", () => {
  it("reads only a snapshot of the game whose owner publishes a listed profile", async () => {
    publish();
    await caller.days({ snapshotId: "snapshot" });
    const [access] = db.queries;
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
    db.scores = [[1005000, 13, 3, 3, 4, 0]];
    const result = await caller.stats({ game: "maimai", snapshotId: "snapshot" });
    expect(result.stats[13][3].statuses).toEqual({ comboStatus: { 3: 1 }, syncStatus: { 4: 1 } });
    const [scores, catalog] = dataQueries();
    expect(scores.params).toEqual([41]);
    expect(catalog.params).toEqual(["maimai", "intl", 13]);
  });

  it("leaves out combo and sync counts unless the owner shares score details", async () => {
    publish({ profileShowScoreDetails: false });
    db.scores = [[1005000, 13, 3, 3, 4, 0]];
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
