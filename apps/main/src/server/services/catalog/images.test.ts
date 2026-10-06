import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { CatalogChart } from "./ingestion/schema";

const mocks = vi.hoisted(() => ({ list: vi.fn(), upload: vi.fn(), fetch: vi.fn(), convert: vi.fn() }));
vi.mock("@/lib/r2", () => ({ listCoverKeys: mocks.list, uploadCoverToR2: mocks.upload }));
vi.mock("@/lib/image-converter", () => ({ fetchImageBuffer: mocks.fetch, convertToWebp: mocks.convert }));
import { processCatalogImages } from "./images";
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
});
