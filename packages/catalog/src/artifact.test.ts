import assert from "node:assert/strict";
import { test } from "vitest";
import { catalogArtifactSchema, catalogManifestSchema, type CatalogArtifact } from "./artifact";

function fixture(): CatalogArtifact {
  return {
    schemaVersion: 1, sequence: 1, generatedAt: "2026-09-12T00:00:00.000Z",
    parents: [{ id: "9007199254740993", publicId: "Abcd_123", songName: "Song", artist: "Artist", genre: "Genre", cover: "covers/song.webp", bpm: null, type: "dx", difficulty: "master", disambiguator: 0 }],
    songs: [{ id: "9223372036854775807", parentId: "9007199254740993", region: "jp", gameVersion: 26, addedVersion: 25, level: "14", levelPrecise: 140, noteDesigner: null, tapCount: null, holdCount: null, slideCount: null, touchCount: null, breakCount: null }],
    tourEvents: [{ id: 1, name: "Tour", periods: [] }],
    tourEventSteps: [{ id: 1, eventId: 1, distance: 10, type: "icon", reward: "Icon" }],
  };
}

test("bigint IDs survive JSON without precision loss", () => {
  const artifact = catalogArtifactSchema.parse(JSON.parse(JSON.stringify(fixture())));
  assert.equal(artifact.parents[0].id, "9007199254740993");
  assert.equal(artifact.songs[0].id, "9223372036854775807");
});

test("rejects malformed and overflowing bigint IDs without throwing from refinement", () => {
  for (const id of ["0", "01", "-1", "abc", "9223372036854775808", 9007199254740992]) {
    const artifact = fixture();
    Object.assign(artifact.parents[0], { id });
    assert.equal(catalogArtifactSchema.safeParse(artifact).success, false);
  }
});

test("rejects duplicate database and public identities", () => {
  const artifact = fixture();
  artifact.parents.push({ ...artifact.parents[0], id: "2" });
  assert.equal(catalogArtifactSchema.safeParse(artifact).success, false);
  artifact.parents.pop();
  artifact.songs.push({ ...artifact.songs[0], id: "2" });
  assert.equal(catalogArtifactSchema.safeParse(artifact).success, false);
});

test("rejects dangling parent and event references", () => {
  const artifact = fixture();
  artifact.songs[0].parentId = "2";
  assert.equal(catalogArtifactSchema.safeParse(artifact).success, false);
  artifact.songs[0].parentId = artifact.parents[0].id;
  artifact.tourEventSteps[0].eventId = 2;
  assert.equal(catalogArtifactSchema.safeParse(artifact).success, false);
});

test("requires supported manifest version and safe sequence", () => {
  const manifest = { schemaVersion: 1, sequence: 1, sha256: "a".repeat(64), url: "https://example.com/catalog.gz", generatedAt: fixture().generatedAt, counts: { parents: 1, songs: 1, tourEvents: 1 } };
  assert.equal(catalogManifestSchema.safeParse(manifest).success, true);
  assert.equal(catalogManifestSchema.safeParse({ ...manifest, url: "catalog/catalog-7.json.gz" }).success, true);
  assert.equal(catalogManifestSchema.safeParse({ ...manifest, url: "../catalog-7.json.gz" }).success, false);
  assert.equal(catalogManifestSchema.safeParse({ ...manifest, schemaVersion: 2 }).success, false);
  assert.equal(catalogManifestSchema.safeParse({ ...manifest, sequence: Number.MAX_SAFE_INTEGER + 1 }).success, false);
});
