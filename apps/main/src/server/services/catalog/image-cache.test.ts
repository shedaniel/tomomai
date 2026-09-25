import { beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
const mocks = vi.hoisted(() => ({ select: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/image_cacher", () => ({ cacheImage: mocks.cache }));
import { cacheCatalogImages } from "./image-cache";
const log = pino({ enabled: false });
beforeEach(() => vi.clearAllMocks());
function covers(urls: string[]) {
  mocks.select.mockReturnValue({ from: () => ({ where: () => ({ groupBy: () => Promise.resolve(urls.map(cover => ({ cover }))) }) }) });
}
describe("stored catalog image cache", () => {
  it("filters empty/data covers and retains per-image errors across batches", async () => {
    covers(["data:image/png;base64,test", "", "https://example.test/a", "https://example.test/b"]);
    mocks.cache.mockImplementation(async url => { if (url.endsWith("/b")) throw new Error("unavailable"); });
    const result = await cacheCatalogImages("chunithm", 1, log);
    expect(mocks.cache.mock.calls).toEqual([["https://example.test/a"], ["https://example.test/b"]]);
    expect(result.statistics).toMatchObject({ totalUrls: 4, httpUrls: 2, cached: 1, errors: 1, batches: 2, batchSize: 1 });
    expect(result).toMatchObject({ errorSample: [{ url: "https://example.test/b", error: "unavailable" }] });
  });
  it("returns the existing empty response without cache work", async () => {
    covers([]);
    const result = await cacheCatalogImages("maimai", 20, log);
    expect(result.message).toBe("No HTTP URLs found to cache");
    expect(result.statistics).toMatchObject({ totalUrls: 0, cached: 0, errors: 0 });
    expect(mocks.cache).not.toHaveBeenCalled();
  });
});
