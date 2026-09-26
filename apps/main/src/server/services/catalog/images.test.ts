import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { PendingChart } from "./ingestion/types";

const mocks = vi.hoisted(() => ({ loadStorage: vi.fn(), list: vi.fn(), upload: vi.fn(), fetch: vi.fn(), convert: vi.fn() }));
vi.mock("@/lib/r2", () => {
  mocks.loadStorage();
  return { listCoverKeys: mocks.list, uploadCoverToR2: mocks.upload };
});
vi.mock("@/lib/image-converter", () => ({ fetchImageBuffer: mocks.fetch, convertToWebp: mocks.convert }));
import { processCatalogImages } from "./images";
const log = pino({ enabled: false });
const chart = (cover: string): PendingChart => ({ game: "maimai", songName: "Song", chartType: 0, difficulty: 3, cover });
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
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(preferred, "");
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(Buffer.from("webp"), "shared");
    expect(result.songs.map(song => song.cover)).toEqual(Array(2).fill("https://catalog.example.test/covers/shared.webp"));
    expect(result.stats).toEqual({ uploaded: 1, skipped: 0, unchanged: 0 });
  });
  it("deduplicates CHUNITHM covers under a game-specific key and preserves chart metadata", async () => {
    const cover = "https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/jacket/example.jpg";
    const records: PendingChart[] = [3, 4].map(difficulty => ({
      ...chart(cover), game: "chunithm", difficulty, metadata: { otogeDb: { id: "123" } },
    }));
    mocks.list.mockResolvedValue(new Set(["example.webp"]));
    const result = await processCatalogImages("chunithm", records, log);
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(cover, "");
    expect(mocks.convert).toHaveBeenCalledExactlyOnceWith(Buffer.from("source"));
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(Buffer.from("webp"), "chunithm/example");
    expect(result.songs).toEqual(records.map(record => ({ ...record, cover: "https://catalog.example.test/covers/chunithm/example.webp" })));
    expect(result.stats).toEqual({ uploaded: 1, skipped: 0, unchanged: 0 });
  });
  it("reuses a CHUNITHM cover uploaded by a previous regional run", async () => {
    const record: PendingChart = { ...chart("https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/jacket/example.jpg"), game: "chunithm" };
    mocks.list.mockResolvedValue(new Set(["chunithm/example.webp"]));
    const result = await processCatalogImages("chunithm", [record], log);
    expect(result.songs).toEqual([{ ...record, cover: "https://catalog.example.test/covers/chunithm/example.webp" }]);
    expect(result.stats).toEqual({ uploaded: 0, skipped: 1, unchanged: 0 });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.convert).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each(["fetch", "convert", "upload"] as const)("rejects a CHUNITHM cover %s failure", async stage => {
    const record: PendingChart = { ...chart("https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/jacket/example.jpg"), game: "chunithm" };
    const error = new Error(`${stage} failed`);
    mocks[stage].mockRejectedValueOnce(error);
    await expect(processCatalogImages("chunithm", [record], log)).rejects.toBe(error);
  });
  it.each([
    "https://catalog.example.test/covers/chunithm/example.webp",
    "https://maimaidx.com/maimai-mobile/img/Music/shared.png",
    "https://example.test/chunithm/jacket/example.jpg",
  ])("retains unmatched CHUNITHM covers without storage work: %s", async cover => {
    const record: PendingChart = { ...chart(cover), game: "chunithm" };
    const result = await processCatalogImages("chunithm", [record], log);
    expect(result.songs).toEqual([record]);
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
