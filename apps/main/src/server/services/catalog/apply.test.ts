import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogCollectContext } from "./ingestion/types";
import type { CatalogChart } from "./ingestion/schema";
import type { CatalogPersistResult } from "./ingestion/persistence";

const mocks = vi.hoisted(() => {
  const log = { child: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  log.child.mockReturnValue(log);
  return {
    log, calls: [] as string[], collect: vi.fn(), images: vi.fn(), persist: vi.fn(),
    publish: vi.fn(), revalidate: vi.fn(), webhook: vi.fn(), notice: vi.fn(),
  };
});
vi.mock("./ingestion/collect", async importOriginal => ({
  ...await importOriginal<typeof import("./ingestion/collect")>(),
  collectCatalog: (game: string, ctx: CatalogCollectContext) => mocks.collect(game, ctx),
}));
vi.mock("@/server/services/games/maimai/login", () => ({ loginAndGetCookies: vi.fn() }));
vi.mock("./images", async importOriginal => ({
  ...await importOriginal<typeof import("./images")>(),
  processCatalogImages: mocks.images,
}));
vi.mock("./ingestion/persistence", () => ({ persistCatalog: mocks.persist }));
vi.mock("./publication", () => ({ publishSongCatalog: mocks.publish }));
vi.mock("./revalidation", () => ({ revalidateCatalog: mocks.revalidate }));
vi.mock("./notifications", () => ({ sendDiscordWebhook: mocks.webhook }));
vi.mock("@/server/services/discord/webhook", () => ({ sendDiscordNotice: mocks.notice }));
vi.mock("@/lib/games/versions", () => ({ getCurrentVersion: () => 9 }));

import { applyCatalogUpload, collectCatalogRegion, updateCatalogRegion } from "./apply";
import { AdminRequestError } from "./admin-game";

const chart: CatalogChart = {
  game: "chunithm", songName: "Example", artist: "Artist", chartType: 0, difficulty: 4,
  level: "14+", levelPrecise: 145, addedVersion: 9, cover: "https://example.test/cover.jpg", genre: "Original",
};
const persisted = (applied: Partial<CatalogPersistResult["applied"]> = { added: 1 }): CatalogPersistResult => ({
  statistics: { inputSongs: 1, dbSongs: 0, mergedSongs: 1, added: 1, modified: 0, deleted: 0, unchanged: 0 },
  changes: { added: [], modified: [], deleted: [], unchanged: [] },
  applied: { added: 0, modified: 0, deleted: 0, newParents: 0, parentUpdates: 0, ...applied },
  appliedDeletions: [], skippedDeletions: [], affected: [{ songName: "Example", artist: "Artist", chartType: 0 }],
});
const request = { game: "chunithm", region: "jp", log: mocks.log as never, requestId: "apply-test" } as const;
const upload = (mode: "noop" | "alter" = "alter") => applyCatalogUpload({ ...request, version: 9, charts: [chart], mode });
const record = (name: string) => vi.fn(async () => { mocks.calls.push(name); });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.log.child.mockReturnValue(mocks.log);
  mocks.collect.mockResolvedValue([chart]);
  mocks.images.mockImplementation(async (_game: string, charts: CatalogChart[]) => ({
    charts: charts.map(entry => ({ ...entry, cover: "https://cdn.example.test/covers/chunithm/cover.webp" })),
    stats: { uploaded: 1, skipped: 0, unchanged: 0 },
  }));
  mocks.persist.mockImplementation(async () => { mocks.calls.push("persist"); return persisted(); });
  mocks.publish.mockImplementation(async () => { mocks.calls.push("publish"); return { songCount: 1, bytes: 1 }; });
  mocks.revalidate.mockImplementation(record("revalidate"));
  mocks.webhook.mockImplementation(record("webhook"));
  mocks.notice.mockResolvedValue(undefined);
});

describe("applyCatalogUpload", () => {
  it("persists, then publishes before it invalidates caches and posts the change", async () => {
    const outcome = await upload();
    expect(mocks.calls).toEqual(["persist", "publish", "revalidate", "webhook"]);
    expect(mocks.persist).toHaveBeenCalledWith("chunithm", "jp", 9, [chart], "alter", mocks.log);
    expect(mocks.revalidate).toHaveBeenCalledWith("chunithm", { affected: persisted().affected, log: mocks.log });
    expect(outcome).toEqual({ updateMode: "alter", applied: persisted().applied, statistics: persisted().statistics, changes: persisted().changes });
  });

  it("previews a noop upload without publishing, invalidating or posting the change", async () => {
    await upload("noop");
    expect(mocks.calls).toEqual(["persist"]);
  });

  it("refreshes the whole catalog when an upload changes no chart", async () => {
    mocks.persist.mockResolvedValueOnce(persisted({}));
    await upload();
    expect(mocks.revalidate).toHaveBeenCalledWith("chunithm", { affected: undefined, log: mocks.log });
  });

  it("refuses to write CHUNITHM charts whose covers still point at otoge-db, and previews them", async () => {
    const unhosted = { ...chart, cover: "https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/jacket/example.jpg" };
    const writing = applyCatalogUpload({ ...request, version: 9, charts: [unhosted], mode: "alter" });
    await expect(writing).rejects.toBeInstanceOf(AdminRequestError);
    await expect(writing).rejects.toThrow("Unhosted catalog cover: Example ULTIMA");
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.notice).not.toHaveBeenCalled();

    await applyCatalogUpload({ ...request, version: 9, charts: [unhosted], mode: "noop" });
    expect(mocks.persist).toHaveBeenCalledOnce();
  });

  it("writes maimai charts with their source covers", async () => {
    const maimai: CatalogChart = { ...chart, game: "maimai", chartType: 1, difficulty: 3, cover: "https://maimaidx.jp/maimai-mobile/img/Music/example.png" };
    await applyCatalogUpload({ ...request, game: "maimai", version: 9, charts: [maimai], mode: "alter" });
    expect(mocks.persist).toHaveBeenCalledWith("maimai", "jp", 9, [maimai], "alter", mocks.log);
  });
});

describe("collectCatalogRegion", () => {
  it("refuses a missing maimai source token as a bad request before collecting", async () => {
    const collecting = collectCatalogRegion({ ...request, game: "maimai", version: 9, sourceToken: null });
    await expect(collecting).rejects.toBeInstanceOf(AdminRequestError);
    expect(mocks.collect).not.toHaveBeenCalled();
    expect(mocks.notice).not.toHaveBeenCalled();
  });
});

describe("updateCatalogRegion", () => {
  it("refuses to turn off CHUNITHM cover hosting as a bad request before collecting", async () => {
    const updating = updateCatalogRegion({ ...request, sourceToken: null, hostImages: false });
    await expect(updating).rejects.toBeInstanceOf(AdminRequestError);
    await expect(updating).rejects.toThrow("CHUNITHM covers must be hosted, so image_upload cannot be false");
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty catalog", []],
    ["duplicate charts", [chart, chart]],
  ])("refuses to write %s from a broken source", async (_name, charts) => {
    mocks.collect.mockResolvedValueOnce(charts);
    await expect(updateCatalogRegion({ ...request, sourceToken: null, hostImages: true })).rejects.toThrow();
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
