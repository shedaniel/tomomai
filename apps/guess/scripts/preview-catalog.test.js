import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPreviewCatalog } from "./preview-catalog.js";

test("fetches the current JP slice from the configured API", async () => {
  const requests = [];
  const songs = [{ songId: "Ab3xK9pQ:j14", songName: "Example" }];
  const result = await fetchPreviewCatalog("https://example.test/", async url => {
    requests.push(url);
    return Response.json(requests.length === 1 ? { currentVersion: 14 } : { songs });
  });
  assert.deepEqual(requests, [
    "https://example.test/api/v1/songs/versions?region=jp",
    "https://example.test/api/v1/songs?region=jp&gameVersion=14",
  ]);
  assert.deepEqual(result, songs);
});

test("rejects invalid metadata without fetching the catalog", async () => {
  for (const currentVersion of [undefined, "14", 14.5, 32768]) {
    let calls = 0;
    await assert.rejects(fetchPreviewCatalog("https://example.test", async () => {
      calls++;
      return Response.json({ currentVersion });
    }), /Invalid current JP catalog version/);
    assert.equal(calls, 1);
  }
});

test("reports version and catalog HTTP failures", async () => {
  await assert.rejects(fetchPreviewCatalog("https://example.test", async () => new Response(null, { status: 503 })), /Catalog version fetch failed: 503/);
  let calls = 0;
  await assert.rejects(fetchPreviewCatalog("https://example.test", async () => ++calls === 1
    ? Response.json({ currentVersion: 13 })
    : new Response(null, { status: 404 })), /Catalog fetch failed: 404/);
});

test("rejects malformed catalog responses", async () => {
  let calls = 0;
  await assert.rejects(fetchPreviewCatalog("https://example.test", async () => Response.json(++calls === 1
    ? { currentVersion: 13 } : { songs: null })), /Invalid song catalog response/);
});
