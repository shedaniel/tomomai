import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogSliceUrl,
  catalogVersionsUrl,
  decodeCatalogSlice,
  fetchCatalogSlice,
  fetchCurrentCatalogSlice,
  type CatalogFetcher,
} from "./catalog-client.ts";

function respondWith(...bodies: unknown[]): { fetcher: CatalogFetcher; requests: string[] } {
  const requests: string[] = [];
  const fetcher: CatalogFetcher = async url => {
    requests.push(url);
    const body = bodies[requests.length - 1];
    return body instanceof Response ? body : Response.json(body);
  };
  return { fetcher, requests };
}

describe("catalog urls", () => {
  it("builds the versions and slice paths under the game's API root", () => {
    assert.equal(catalogVersionsUrl("https://example.test//", "maimai", "jp"), "https://example.test/api/v1/games/maimai/songs/versions?region=jp");
    assert.equal(catalogSliceUrl("https://example.test", "chunithm", "intl", -1), "https://example.test/api/v1/games/chunithm/songs?region=intl&gameVersion=-1");
  });
});

describe("decodeCatalogSlice", () => {
  it("decodes chart type and difficulty with the game's own code table", () => {
    const song = { songId: "Ab3xK9pQ:j14", songName: "Example", type: 0, difficulty: 5 };
    assert.deepEqual(decodeCatalogSlice({ game: "maimai", songs: [song] }, "maimai"), [{ ...song, type: "std", difficulty: "utage" }]);
    assert.deepEqual(decodeCatalogSlice({ game: "chunithm", songs: [song] }, "chunithm"), [{ ...song, type: "standard", difficulty: "worlds-end" }]);
  });

  it("rejects malformed bodies and another game's catalog", () => {
    for (const body of [null, "songs", { game: "maimai", songs: null }]) {
      assert.throws(() => decodeCatalogSlice(body, "maimai"), /Invalid song catalog response/);
    }
    assert.throws(() => decodeCatalogSlice({ game: "chunithm", songs: [] }, "maimai"), /Expected a maimai song catalog, got chunithm/);
  });

  it("rejects a code the game does not define instead of guessing", () => {
    assert.throws(() => decodeCatalogSlice({ game: "maimai", songs: [{ type: 2, difficulty: 5 }] }, "maimai"), /Unknown maimai chart type code: 2/);
    assert.throws(() => decodeCatalogSlice({ game: "chunithm", songs: [{ type: 1, difficulty: 0 }] }, "chunithm"), /Unknown chunithm chart type code: 1/);
  });
});

describe("fetchCatalogSlice", () => {
  it("fetches and decodes one slice", async () => {
    const { fetcher, requests } = respondWith({ game: "maimai", songs: [{ songId: "Ab3xK9pQ:c-2", type: 1, difficulty: 3 }] });
    assert.deepEqual(await fetchCatalogSlice("https://example.test", "maimai", "cn", -2, fetcher), [{ songId: "Ab3xK9pQ:c-2", type: "dx", difficulty: "master" }]);
    assert.deepEqual(requests, ["https://example.test/api/v1/games/maimai/songs?region=cn&gameVersion=-2"]);
  });

  it("reports the HTTP status of a failed slice", async () => {
    const { fetcher } = respondWith(new Response(null, { status: 404 }));
    await assert.rejects(fetchCatalogSlice("https://example.test", "maimai", "jp", 14, fetcher), /Song catalog fetch failed: 404/);
  });
});

describe("fetchCurrentCatalogSlice", () => {
  it("fetches the slice the versions endpoint names as current", async () => {
    const songs = [{ songId: "Ab3xK9pQ:j14", songName: "Example", type: 1, difficulty: 3 }];
    const { fetcher, requests } = respondWith({ currentVersion: 14 }, { game: "maimai", songs });
    const result = await fetchCurrentCatalogSlice("https://example.test/", "maimai", "jp", fetcher);
    assert.deepEqual(requests, [
      "https://example.test/api/v1/games/maimai/songs/versions?region=jp",
      "https://example.test/api/v1/games/maimai/songs?region=jp&gameVersion=14",
    ]);
    assert.deepEqual(result, songs.map(song => ({ ...song, type: "dx", difficulty: "master" })));
  });

  it("rejects an invalid current version without fetching the slice", async () => {
    for (const body of [{}, { currentVersion: "14" }, { currentVersion: 14.5 }, { currentVersion: 32768 }, null]) {
      const { fetcher, requests } = respondWith(body);
      await assert.rejects(fetchCurrentCatalogSlice("https://example.test", "maimai", "jp", fetcher), /Invalid current maimai jp catalog version/);
      assert.equal(requests.length, 1);
    }
  });

  it("reports the HTTP status of the versions and slice requests", async () => {
    await assert.rejects(
      fetchCurrentCatalogSlice("https://example.test", "maimai", "jp", respondWith(new Response(null, { status: 503 })).fetcher),
      /Song catalog versions fetch failed: 503/,
    );
    await assert.rejects(
      fetchCurrentCatalogSlice("https://example.test", "maimai", "jp", respondWith({ currentVersion: 13 }, new Response(null, { status: 404 })).fetcher),
      /Song catalog fetch failed: 404/,
    );
  });
});
