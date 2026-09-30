import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, beforeEach, describe, it } from "node:test";

type Reply = { status?: number; songs?: unknown[] };

let reply: (url: URL) => Reply = () => ({});
const requests: string[] = [];

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://catalog.test");
  requests.push(`${url.pathname}${url.search}`);
  const { status = 200, songs = [] } = reply(url);
  response.writeHead(status, { "content-type": "application/json" });
  response.end(status === 200 ? JSON.stringify({ game: "maimai", songs }) : undefined);
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));

process.env.CATALOG_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
process.env.LOG_LEVEL = "silent";
// The module reads CATALOG_URL on load. Its slice cache lives for the whole file, so each test uses its own versions.
const { catalogEntry, getCatalog } = await import("./catalog");

const entry = (songId: string, songName = songId) => ({
  songId, songName, artist: "Artist", cover: "https://example.test/cover.png", type: 1, genre: "maimai",
  difficulty: 3, level: "13", levelPrecise: 133, region: "jp", gameVersion: 14,
  addedVersion: 10, bpm: 180, noteDesigner: null,
});

const sliceUrl = (region: string, gameVersion: number) => `/api/v1/games/maimai/songs?region=${region}&gameVersion=${gameVersion}`;

beforeEach(() => {
  requests.length = 0;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

describe("render catalog slices", () => {
  it("fetches each referenced region and version once, keeping distinct instances of a chart", async () => {
    reply = url => ({ songs: [entry(url.searchParams.get("region") === "jp" ? "Ab3xK9pQ:j14" : "Ab3xK9pQ:i-1")] });
    const catalog = await getCatalog(["Ab3xK9pQ:j14", "OtherId_:j14", "Ab3xK9pQ:i-1"]);
    assert.deepEqual(requests.toSorted(), [sliceUrl("intl", -1), sliceUrl("jp", 14)]);
    assert.deepEqual([...catalog.keys()], ["Ab3xK9pQ:j14", "Ab3xK9pQ:i-1"]);
    assert.equal(catalogEntry(catalog, "Ab3xK9pQ:j14").difficulty, "master");
    await getCatalog(["Ab3xK9pQ:i-1"]);
    assert.equal(requests.length, 2);
  });

  it("coalesces simultaneous requests and refreshes a slice after five minutes", async t => {
    t.mock.timers.enable({ apis: ["Date"] });
    reply = () => ({ songs: [entry("Ab3xK9pQ:j15", "Original")] });
    await Promise.all([getCatalog(["Ab3xK9pQ:j15"]), getCatalog(["Ab3xK9pQ:j15"])]);
    assert.deepEqual(requests, [sliceUrl("jp", 15)]);
    t.mock.timers.tick(299_999);
    assert.equal((await getCatalog(["Ab3xK9pQ:j15"])).get("Ab3xK9pQ:j15")?.songName, "Original");
    assert.equal(requests.length, 1);
    t.mock.timers.tick(1);
    reply = () => ({ songs: [entry("Ab3xK9pQ:j15", "Updated")] });
    assert.equal((await getCatalog(["Ab3xK9pQ:j15"])).get("Ab3xK9pQ:j15")?.songName, "Updated");
    assert.equal(requests.length, 2);
  });

  it("retries a failed slice without refetching the slices that loaded", async () => {
    reply = () => ({ songs: [entry("Ab3xK9pQ:j16")] });
    await getCatalog(["Ab3xK9pQ:j16"]);
    reply = () => ({ status: 503 });
    await assert.rejects(getCatalog(["Ab3xK9pQ:j16", "Ab3xK9pQ:i-2"]), /503/);
    reply = () => ({ songs: [entry("Ab3xK9pQ:i-2")] });
    assert.equal((await getCatalog(["Ab3xK9pQ:j16", "Ab3xK9pQ:i-2"])).size, 2);
    assert.deepEqual(requests, [sliceUrl("jp", 16), sliceUrl("intl", -2), sliceUrl("intl", -2)]);
  });

  it("rejects malformed instance ids before any fetch", async () => {
    for (const id of ["Ab3xK9pQ", "Ab3xK9pQ:j01", "Ab3xK9pQ:j-0", "Ab3xK9pQ:x1", "Ab3xK9pQ:j32768", "Ab3xK9pQ:j-32769"]) {
      await assert.rejects(getCatalog(["Ab3xK9pQ:j17", id]), /Invalid song/);
    }
    assert.equal((await getCatalog([])).size, 0);
    assert.equal(requests.length, 0);
  });

  it("refuses a chart the slice lacks or publishes without a cover", async () => {
    reply = () => ({ songs: [{ ...entry("Ab3xK9pQ:j18"), cover: null }] });
    const catalog = await getCatalog(["Ab3xK9pQ:j18"]);
    assert.throws(() => catalogEntry(catalog, "OtherId_:j18"), /Chart not in catalogue: OtherId_:j18/);
    assert.throws(() => catalogEntry(catalog, "Ab3xK9pQ:j18"), /Chart has no cover: Ab3xK9pQ:j18/);
  });
});
