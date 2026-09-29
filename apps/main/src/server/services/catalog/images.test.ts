import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { CatalogChart } from "./ingestion/schema";

const mocks = vi.hoisted(() => ({ loadStorage: vi.fn(), list: vi.fn(), upload: vi.fn(), fetch: vi.fn(), convert: vi.fn() }));
vi.mock("@/lib/r2", () => {
  mocks.loadStorage();
  return { listCoverKeys: mocks.list, uploadCoverToR2: mocks.upload };
});
vi.mock("@/lib/image-converter", () => ({ fetchImageBuffer: mocks.fetch, convertToWebp: mocks.convert }));
import { assertCoverHostingEnabled, assertCoversHosted, processCatalogImages } from "./images";
const log = pino({ enabled: false });
const chart = (cover: string): CatalogChart => ({
  game: "maimai", songName: "Song", chartType: 0, difficulty: 3, cover,
  artist: "Artist", level: "13", levelPrecise: 130, genre: "maimai", addedVersion: 20,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_R2_URL", "https://catalog.example.test");
  mocks.list.mockResolvedValue(new Set(["music_dx.webp", "music_standard.webp"]));
  mocks.fetch.mockResolvedValue(Buffer.from("source"));
  mocks.convert.mockResolvedValue(Buffer.from("webp"));
});
afterEach(() => vi.unstubAllEnvs());

describe("catalog image processing", () => {
  it("does not initialize storage for a game with no image work", async () => {
    await processCatalogImages("chunithm", [], log);
    expect(mocks.loadStorage).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("deduplicates covers, preserves preferred source and rewrites every matching chart", async () => {
    const first = "https://maimaidx-eng.com/maimai-mobile/img/Music/shared.png";
    const preferred = "https://maimaidx.com/maimai-mobile/img/Music/shared.png";
    const result = await processCatalogImages("maimai", [chart(first), chart(preferred)], log);
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(preferred);
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(Buffer.from("webp"), "shared");
    expect(result.charts.map(song => song.cover)).toEqual(Array(2).fill("https://catalog.example.test/covers/shared.webp"));
    expect(result.stats).toEqual({ uploaded: 1, skipped: 0, unchanged: 0 });
  });
  it("deduplicates CHUNITHM covers under a game-specific key and preserves chart metadata", async () => {
    const cover = "https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/jacket/example.jpg";
    const records: CatalogChart[] = [3, 4].map(difficulty => ({
      ...chart(cover), game: "chunithm", difficulty, metadata: { source: { provider: "otoge-db", id: "123" } },
    }));
    mocks.list.mockResolvedValue(new Set(["example.webp"]));
    const result = await processCatalogImages("chunithm", records, log);
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(cover);
    expect(mocks.convert).toHaveBeenCalledExactlyOnceWith(Buffer.from("source"));
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(Buffer.from("webp"), "chunithm/example");
    expect(result.charts).toEqual(records.map(record => ({ ...record, cover: "https://catalog.example.test/covers/chunithm/example.webp" })));
    expect(result.stats).toEqual({ uploaded: 1, skipped: 0, unchanged: 0 });
  });
  it("reuses a CHUNITHM cover uploaded by a previous regional run", async () => {
    const record: CatalogChart = { ...chart("https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/jacket/example.jpg"), game: "chunithm" };
    mocks.list.mockResolvedValue(new Set(["chunithm/example.webp"]));
    const result = await processCatalogImages("chunithm", [record], log);
    expect(result.charts).toEqual([{ ...record, cover: "https://catalog.example.test/covers/chunithm/example.webp" }]);
    expect(result.stats).toEqual({ uploaded: 0, skipped: 1, unchanged: 0 });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.convert).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each(["fetch", "convert", "upload"] as const)("rejects a CHUNITHM cover %s failure", async stage => {
    const record: CatalogChart = { ...chart("https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/jacket/example.jpg"), game: "chunithm" };
    const error = new Error(`${stage} failed`);
    mocks[stage].mockRejectedValueOnce(error);
    await expect(processCatalogImages("chunithm", [record], log)).rejects.toBe(error);
  });
  it.each([
    "https://catalog.example.test/covers/chunithm/example.webp",
    "https://maimaidx.com/maimai-mobile/img/Music/shared.png",
    "https://example.test/chunithm/jacket/example.jpg",
  ])("retains unmatched CHUNITHM covers without storage work: %s", async cover => {
    const record: CatalogChart = { ...chart(cover), game: "chunithm" };
    const result = await processCatalogImages("chunithm", [record], log);
    expect(result.charts).toEqual([record]);
    expect(result.stats).toEqual({ uploaded: 0, skipped: 0, unchanged: 1 });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.convert).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("still uploads missing maimai static assets when no covers need work", async () => {
    mocks.list.mockResolvedValue(new Set());
    const result = await processCatalogImages("maimai", [], log);
    expect(mocks.list).toHaveBeenCalledOnce();
    expect(mocks.upload.mock.calls.map(call => call[1])).toEqual(["music_dx", "music_standard"]);
    expect(result.stats).toEqual({ uploaded: 0, skipped: 0, unchanged: 0 });
  });
});

describe("catalog cover hosting", () => {
  const otogeDb = "https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/jacket/example.jpg";

  it("refuses CHUNITHM charts that still point at an otoge-db cover", () => {
    expect(() => assertCoversHosted("chunithm", [{ ...chart(otogeDb), game: "chunithm", difficulty: 4 }])).toThrow("Unhosted catalog cover: Song ULTIMA");
    expect(() => assertCoversHosted("chunithm", [{ ...chart("https://catalog.example.test/covers/chunithm/example.webp"), game: "chunithm" }])).not.toThrow();
    expect(() => assertCoverHostingEnabled("chunithm", false)).toThrow("CHUNITHM covers must be hosted");
  });

  it("lets maimai keep its source covers, which the site loads directly", () => {
    expect(() => assertCoversHosted("maimai", [chart("https://maimaidx.jp/maimai-mobile/img/Music/shared.png")])).not.toThrow();
    expect(() => assertCoverHostingEnabled("maimai", false)).not.toThrow();
  });
});
