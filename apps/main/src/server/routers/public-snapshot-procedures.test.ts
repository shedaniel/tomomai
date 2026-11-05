import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ProfilePrivacySettings } from "@/lib/types";
import type { ProxyRow } from "@/test/pg-proxy";
import { PROFILE_PART_AUDIENCES, type ProfileAudience } from "@/lib/profile-audience";

type Privacy = Pick<ProfilePrivacySettings, "profileShowAllScores" | "profileShowScoreDetails" | "profileShowPlates" | "profileShowPlayCounts" | "profileShowEvents">;
const SHARED: Privacy = { profileShowAllScores: true, profileShowScoreDetails: true, profileShowPlates: true, profileShowPlayCounts: true, profileShowEvents: true };

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger")>()),
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: proxy.db }));
const friends = vi.hoisted(() => ({ areFriends: vi.fn() }));
vi.mock("@/server/services/friends/queries", () => friends);

import { router, type Context } from "@/lib/trpc";
import { statsRouter } from "./user/stats";
import { recentsRouter } from "./user/recents";
import { platesRouter } from "./maimai/plates";
import { dailyPlaysRouter } from "./user/daily-plays";
import { creditsRouter } from "./maimai/credits";

const routes = router({
  stats: statsRouter.getPublicPlayerStats,
  recents: recentsRouter.getPublicRecentSongs,
  plates: platesRouter.getPublicPlateSongs,
  days: dailyPlaysRouter.getPublicAvailableDays,
  credits: creditsRouter.getPublicCredits,
  credit: creditsRouter.getPublicCredit,
});
const caller = routes.createCaller({ session: null, req: new NextRequest("http://localhost/api/trpc") });
const friendCaller = routes.createCaller({
  session: { user: { id: "friend" } } as unknown as Context["session"],
  req: new NextRequest("http://localhost/api/trpc"),
});

const stored = { snapshot: null as ProxyRow | null, scores: [] as ProxyRow[], catalog: [] as ProxyRow[] };

type Owner = { profileVisibility: ProfileAudience; profileShowInSearch: boolean };
const PUBLIC: Owner = { profileVisibility: "public", profileShowInSearch: true };

/** Stores a snapshot whose owner shares each part with everyone, or with no one where `privacy` turns it off. */
function publish(privacy: Partial<Privacy> = {}, region = "jp", owner: Owner = PUBLIC) {
  const shared = { ...SHARED, ...privacy };
  const audiences = Object.fromEntries(Object.entries(PROFILE_PART_AUDIENCES).map(([part, key]) => [key, shared[part as keyof Privacy] ? "public" : "private"]));
  stored.snapshot = { userId: "owner", snapshotInternalId: 41, gameVersion: 13, region, ...audiences, ...owner };
}

/** The queries after the access check, which is always the first one. */
function dataQueries() {
  return proxy.queries.slice(1);
}

beforeEach(() => {
  proxy.reset();
  friends.areFriends.mockReset().mockResolvedValue(false);
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
  it("reads only a snapshot of the game", async () => {
    publish();
    await caller.days({ game: "maimai", snapshotId: "snapshot" });
    const [access] = proxy.queries;
    expect(access.sql).toContain('"user_snapshots"."game" = $1');
    expect(access.params).toEqual(["maimai", "snapshot", 1]);
  });

  it("hides a private profile's snapshot from visitors", async () => {
    publish({}, "jp", { ...PUBLIC, profileVisibility: "private" });
    await expect(caller.days({ game: "maimai", snapshotId: "snapshot" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dataQueries()).toEqual([]);
  });

  it("serves an unlisted profile's snapshot, which only search and the sitemap leave out", async () => {
    publish({}, "jp", { ...PUBLIC, profileShowInSearch: false });
    await expect(caller.days({ game: "maimai", snapshotId: "snapshot" })).resolves.toBeDefined();
  });

  it("opens a friends-only profile only for a matched friend", async () => {
    publish({}, "jp", { ...PUBLIC, profileVisibility: "friends" });
    await expect(caller.days({ game: "maimai", snapshotId: "snapshot" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(friendCaller.days({ game: "maimai", snapshotId: "snapshot" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(friends.areFriends).toHaveBeenLastCalledWith("maimai", "friend", "owner");

    friends.areFriends.mockResolvedValue(true);
    await expect(friendCaller.days({ game: "maimai", snapshotId: "snapshot" })).resolves.toBeDefined();
  });

  it("never opens a private profile, even for a friend", async () => {
    publish({}, "jp", { ...PUBLIC, profileVisibility: "private" });
    friends.areFriends.mockResolvedValue(true);
    await expect(friendCaller.days({ game: "maimai", snapshotId: "snapshot" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(friends.areFriends).not.toHaveBeenCalled();
  });

  it("answers NOT_FOUND for a missing or unpublished snapshot without reading any data", async () => {
    await expect(caller.days({ game: "maimai", snapshotId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dataQueries()).toEqual([]);
  });

  it("checks the capability in the snapshot's own region", async () => {
    publish({}, "intl");
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp");
    await expect(caller.days({ game: "maimai", snapshotId: "snapshot" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
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

describe("getPublicCredits and getPublicCredit", () => {
  it("are hidden unless the owner shares score details", async () => {
    publish({ profileShowScoreDetails: false });
    await expect(caller.credits({ snapshotId: "snapshot" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.credit({ snapshotId: "snapshot", at: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(proxy.queries.filter(query => query.table !== "user_snapshots")).toEqual([]);
  });

  it("read the snapshot owner's maimai credits in the snapshot's region", async () => {
    publish({}, "intl");
    await expect(caller.credits({ snapshotId: "snapshot" })).resolves.toEqual({ credits: [], nextCursor: null });
    expect(dataQueries()[0].params).toEqual(expect.arrayContaining(["maimai", "owner", "intl"]));
  });
});

describe("getPublicDailyPlaysAvailableDays", () => {
  it("is hidden unless the owner shares score details", async () => {
    publish({ profileShowScoreDetails: false });
    await expect(caller.days({ game: "maimai", snapshotId: "snapshot" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dataQueries()).toEqual([]);
  });

  it("lists the snapshot owner's play days in the snapshot's region", async () => {
    publish({}, "intl");
    await expect(caller.days({ game: "maimai", snapshotId: "snapshot" })).resolves.toEqual([]);
    expect(dataQueries()[0].params).toEqual(["maimai", "owner", "intl"]);
  });
});
