import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../render/src/lib/request-logger", () => ({ getLogger: () => ({ info: vi.fn() }) }));
vi.mock("undici", () => ({ Agent: class {} }));

const fetchMock = vi.fn<typeof fetch>();
const entry = (songId: string, songName = songId) => ({
  songId, songName, artist: "Artist", cover: null, type: "dx", genre: "maimai",
  difficulty: "master", level: "13", levelPrecise: 133, region: "jp", gameVersion: 14,
  addedVersion: 10, bpm: 180, noteDesigner: null,
});
const response = (...songs: ReturnType<typeof entry>[]) => Response.json({ songs });

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-11T00:00:00Z"));
  vi.stubEnv("CATALOG_URL", "https://catalog.example.test/");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("render catalog slices", () => {
  it("fetches each referenced region/version once, retaining distinct instances of a parent", async () => {
    const { getCatalog } = await import("../../../../render/src/lib/catalog");
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const suffix = url.searchParams.get("region") === "jp" ? "j14" : "i-1";
      return response(entry(`Ab3xK9pQ:${suffix}`));
    });
    const catalog = await getCatalog(["Ab3xK9pQ:j14", "OtherId_:j14", "Ab3xK9pQ:i-1"]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://catalog.example.test/api/v1/songs?region=jp&gameVersion=14",
      "https://catalog.example.test/api/v1/songs?region=intl&gameVersion=-1",
    ]);
    expect([...catalog.keys()]).toEqual(["Ab3xK9pQ:j14", "Ab3xK9pQ:i-1"]);
    await getCatalog(["Ab3xK9pQ:i-1"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("coalesces simultaneous requests and refreshes each slice after five minutes", async () => {
    const { getCatalog } = await import("../../../../render/src/lib/catalog");
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    const first = getCatalog(["Ab3xK9pQ:j14"]);
    const second = getCatalog(["Ab3xK9pQ:j14"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(response(entry("Ab3xK9pQ:j14", "Original")));
    await Promise.all([first, second]);
    vi.advanceTimersByTime(299_999);
    expect((await getCatalog(["Ab3xK9pQ:j14"])).get("Ab3xK9pQ:j14")?.songName).toBe("Original");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    fetchMock.mockResolvedValueOnce(response(entry("Ab3xK9pQ:j14", "Updated")));
    expect((await getCatalog(["Ab3xK9pQ:j14"])).get("Ab3xK9pQ:j14")?.songName).toBe("Updated");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries failed slices without refetching successful slices", async () => {
    const { getCatalog } = await import("../../../../render/src/lib/catalog");
    fetchMock.mockResolvedValueOnce(response(entry("Ab3xK9pQ:j14")));
    await getCatalog(["Ab3xK9pQ:j14"]);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(getCatalog(["Ab3xK9pQ:j14", "Ab3xK9pQ:i-1"])).rejects.toThrow("503");
    fetchMock.mockResolvedValueOnce(response(entry("Ab3xK9pQ:i-1")));
    expect((await getCatalog(["Ab3xK9pQ:j14", "Ab3xK9pQ:i-1"])).size).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2][0])).toContain("region=intl&gameVersion=-1");
  });

  it("rejects malformed instance IDs before any fetch and reports missing charts", async () => {
    const { getCatalog, getCatalogEntry } = await import("../../../../render/src/lib/catalog");
    for (const id of ["Ab3xK9pQ", "Ab3xK9pQ:j01", "Ab3xK9pQ:j-0", "Ab3xK9pQ:x1", "Ab3xK9pQ:j32768", "Ab3xK9pQ:j-32769"]) {
      await expect(getCatalog(["Ab3xK9pQ:j14", id])).rejects.toThrow("Invalid song");
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await getCatalog([])).size).toBe(0);
    fetchMock.mockResolvedValueOnce(response());
    await expect(getCatalogEntry("Ab3xK9pQ:j14")).rejects.toThrow("Chart not in catalogue");
  });
});
