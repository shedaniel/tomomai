import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { PendingChart } from "./ingestion/types";

const mocks = vi.hoisted(() => ({ list: vi.fn(), upload: vi.fn(), fetch: vi.fn(), convert: vi.fn() }));
vi.mock("@/lib/r2", () => ({ listCoverKeys: mocks.list, uploadCoverToR2: mocks.upload }));
vi.mock("@/lib/image-converter", () => ({ fetchImageBuffer: mocks.fetch, convertToWebp: mocks.convert }));
import { processCatalogImages } from "./images";
const log = pino({ enabled: false });
const chart = (cover: string): PendingChart => ({ game: "maimai", songName: "Song", chartType: 0, difficulty: 3, cover });
beforeEach(() => {
  vi.clearAllMocks();
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
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(preferred, "");
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(Buffer.from("webp"), "shared");
    expect(result.songs.map(song => song.cover)).toEqual(Array(2).fill("https://catalog.example.test/covers/shared.webp"));
    expect(result.stats).toEqual({ uploaded: 1, skipped: 0, unchanged: 0 });
  });
  it("retains unmatched CHUNITHM covers without fetching maimai static assets", async () => {
    mocks.list.mockResolvedValue(new Set());
    const record = { ...chart("https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/jacket/example.jpg"), game: "chunithm" as const };
    const result = await processCatalogImages("chunithm", [record], log);
    expect(result.songs).toEqual([record]);
    expect(result.stats).toEqual({ uploaded: 0, skipped: 0, unchanged: 1 });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
