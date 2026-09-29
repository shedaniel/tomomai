import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { locales } from "@tomomai/i18n/locale";
import { catalogTags } from "@/lib/cache-tags";
import type { AffectedChart } from "./ingestion/persistence";

const mocks = vi.hoisted(() => ({ tag: vi.fn(), path: vi.fn(), fetch: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.tag, revalidatePath: mocks.path }));
vi.mock("@/lib/song-slug", () => ({
  getSongSlugs: async (songs: { songName: string; type: string }[]) => songs.map(song => ({ ...song, slug: `${song.songName}-${song.type}` })),
}));

import { revalidateCatalog, revalidateCatalogLocal, SONG_PAGE_BULK_THRESHOLD, SONG_PAGE_ROUTE } from "./revalidation";

const log = { info: vi.fn(), error: vi.fn() };
const chart = (songName: string, chartType = 1): AffectedChart => ({ songName, artist: "Artist", chartType });
const APP = fileURLToPath(new URL("../../../app", import.meta.url));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FRONTEND_GAME", "maimai");
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin-secret");
  vi.stubEnv("CATALOG_PEER_ORIGINS", "");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockResolvedValue(new Response(null, { status: 200 }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("revalidateCatalogLocal", () => {
  it("expires the catalog tags now, and the reserved profiles only for the game that has them", async () => {
    await revalidateCatalogLocal("maimai");
    const maimai = catalogTags("maimai");
    expect(mocks.tag.mock.calls).toEqual([[maimai.uniqueSongs, { expire: 0 }], [maimai.apiSongs, { expire: 0 }], [maimai.reservedSongs, { expire: 0 }]]);

    mocks.tag.mockClear();
    await revalidateCatalogLocal("chunithm");
    const chunithm = catalogTags("chunithm");
    expect(mocks.tag.mock.calls).toEqual([[chunithm.uniqueSongs, { expire: 0 }], [chunithm.apiSongs, { expire: 0 }]]);
  });

  it("leaves pages alone on a site that renders another game", async () => {
    expect(await revalidateCatalogLocal("chunithm", [chart("Song")])).toEqual({ pages: "none", count: 0 });
    expect(mocks.path).not.toHaveBeenCalled();
  });

  it("refreshes each changed song's page and the list in every locale", async () => {
    const result = await revalidateCatalogLocal("maimai", [chart("Song"), chart("Song"), chart("Song", 0)]);
    expect(result).toEqual({ pages: "songs", count: 2 });
    expect(mocks.path.mock.calls).toEqual(locales.flatMap(locale => [
      [`/${locale}/db/songs/Song-dx`],
      [`/${locale}/db/songs/Song-std`],
      [`/${locale}/db/songs`],
    ]));
  });

  it.each([
    ["the whole catalog changed", undefined, 0],
    ["too many songs changed", Array.from({ length: SONG_PAGE_BULK_THRESHOLD + 1 }, (_, index) => chart(`Song ${index}`)), SONG_PAGE_BULK_THRESHOLD + 1],
  ])("refreshes every song page through the route pattern when %s", async (_name, affected, count) => {
    expect(await revalidateCatalogLocal("maimai", affected)).toEqual({ pages: "bulk", count });
    expect(mocks.path.mock.calls).toEqual([
      [SONG_PAGE_ROUTE, "page"],
      ...locales.map(locale => [`/${locale}/db/songs`]),
    ]);
  });

  it("names the route files it revalidates", () => {
    expect(existsSync(`${APP}${SONG_PAGE_ROUTE}/page.tsx`)).toBe(true);
    expect(existsSync(`${APP}/[locale]/db/[type]/page.tsx`)).toBe(true);
  });
});

describe("revalidateCatalog", () => {
  it("revalidates here, then posts the change to every peer with the admin token", async () => {
    vi.stubEnv("CATALOG_PEER_ORIGINS", " https://chunithm.example.test , https://other.example.test/");
    await revalidateCatalog("maimai", { affected: [chart("Song")], log: log as never });
    expect(mocks.tag).toHaveBeenCalledWith(catalogTags("maimai").uniqueSongs, { expire: 0 });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(String(url)).toBe("https://chunithm.example.test/api/admin/catalog/revalidate?game=maimai");
    expect(init).toMatchObject({ method: "POST", headers: { Authorization: "Bearer admin-secret" }, signal: expect.any(AbortSignal) });
    expect(JSON.parse(init.body)).toEqual({ affected: [chart("Song")] });
    expect(String(mocks.fetch.mock.calls[1][0])).toBe("https://other.example.test/api/admin/catalog/revalidate?game=maimai");
  });

  it("sends no chart list when the whole catalog changed", async () => {
    vi.stubEnv("CATALOG_PEER_ORIGINS", "https://chunithm.example.test");
    await revalidateCatalog("maimai", { log: log as never });
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({});
  });

  it("logs failures without throwing and still reaches the peers", async () => {
    vi.stubEnv("CATALOG_PEER_ORIGINS", "https://down.example.test,https://refusing.example.test");
    const local = new Error("revalidate failed");
    mocks.tag.mockImplementationOnce(() => { throw local; });
    mocks.fetch.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(revalidateCatalog("maimai", { log: log as never })).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith({ err: local }, "Catalog cache revalidation failed");
    expect(log.error).toHaveBeenCalledWith({ err: expect.objectContaining({ message: "timeout" }), url: "https://down.example.test" }, "Catalog peer revalidation failed");
    expect(log.error).toHaveBeenCalledWith({ err: expect.objectContaining({ message: "Catalog peer answered 403" }), url: "https://refusing.example.test" }, "Catalog peer revalidation failed");
  });

  it("skips the peers without an admin token to send", async () => {
    vi.stubEnv("CATALOG_PEER_ORIGINS", "https://chunithm.example.test");
    vi.stubEnv("ADMIN_UPDATE_TOKEN", "");
    await revalidateCatalog("maimai", { log: log as never });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith("Catalog peers skipped because ADMIN_UPDATE_TOKEN is not set");
  });
});
