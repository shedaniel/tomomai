import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { CatalogArtifact, CatalogManifest } from "@tomomai/catalog/artifact";
import { assertCatalogIdentities, assertCatalogSource, decodeCatalogArtifact, readBoundedResponse, shouldApplyCatalog } from "./catalog-sync-validation";

const parent = { id: "9007199254740993", publicId: "abcdefgh", songName: "Link", artist: "A", genre: "", cover: "", bpm: null, type: "std" as const, difficulty: "master" as const, disambiguator: 0 };
const song = { id: "9007199254740994", parentId: parent.id, region: "jp" as const, gameVersion: 25, addedVersion: 1, level: "13" as const, levelPrecise: 130, noteDesigner: null, tapCount: null, holdCount: null, slideCount: null, touchCount: null, breakCount: null };
const artifact: CatalogArtifact = { schemaVersion: 1, sequence: 2, generatedAt: "2026-09-12T00:00:00Z", parents: [parent], songs: [song], tourEvents: [], tourEventSteps: [] };
function encoded(value: unknown = artifact) {
  const compressed = gzipSync(JSON.stringify(value));
  const manifest: CatalogManifest = { schemaVersion: 1, sequence: 2, generatedAt: artifact.generatedAt, sha256: createHash("sha256").update(compressed).digest("hex"), url: "https://example.test/catalog.gz", counts: { parents: 1, songs: 1, tourEvents: 0 } };
  return { compressed, manifest };
}
const localParent = { ...parent, id: BigInt(parent.id) };
const localSong = { ...song, id: BigInt(song.id), parentId: BigInt(song.parentId) };

describe("catalog artifact validation", () => {
  it("preserves bigint IDs beyond Number precision", () => {
    const { compressed, manifest } = encoded();
    expect(decodeCatalogArtifact(compressed, manifest).songs[0].id).toBe(song.id);
    expect(() => assertCatalogIdentities(artifact, [localParent], [localSong])).not.toThrow();
  });
  it("rejects a corrupt checksum before decompression", () => {
    const { compressed, manifest } = encoded();
    expect(() => decodeCatalogArtifact(compressed, { ...manifest, sha256: "0".repeat(64) })).toThrow("checksum");
  });
  it.each(["sequence", "schemaVersion", "generatedAt"] as const)("rejects inconsistent %s", field => {
    const { compressed, manifest } = encoded();
    expect(() => decodeCatalogArtifact(compressed, { ...manifest, [field]: field === "generatedAt" ? "2026-09-11T00:00:00Z" : 3 })).toThrow();
  });
  it("rejects inaccurate row counts", () => {
    const { compressed, manifest } = encoded();
    expect(() => decodeCatalogArtifact(compressed, { ...manifest, counts: { ...manifest.counts, songs: 2 } })).toThrow("count");
  });
  it("bounds expansion of compressed artifacts", () => {
    const { compressed, manifest } = encoded();
    expect(() => decodeCatalogArtifact(compressed, manifest, 32)).toThrow();
  });
  it("rejects duplicate and dangling identities", () => {
    for (const value of [{ ...artifact, songs: [song, song] }, { ...artifact, parents: [] }]) {
      const { compressed, manifest } = encoded(value);
      expect(() => decodeCatalogArtifact(compressed, manifest)).toThrow();
    }
  });
  it("bounds streamed bytes even without Content-Length", async () => {
    await expect(readBoundedResponse(new Response("12345"), 4)).rejects.toThrow("size limit");
    expect((await readBoundedResponse(new Response("1234"), 4)).toString()).toBe("1234");
  });
});

describe("catalog state and identity protection", () => {
  it("refuses switching artifact sources", () => {
    expect(() => assertCatalogSource({ sourceUrl: "https://a.test/catalog/latest.json" }, "https://b.test/catalog/latest.json")).toThrow("switch catalog source");
  });
  it("refuses rollback and same-sequence equivocation even with force", () => {
    const { manifest } = encoded();
    expect(() => shouldApplyCatalog({ sequence: 3, sha256: manifest.sha256 }, manifest, true)).toThrow("rollback");
    expect(() => shouldApplyCatalog({ sequence: 2, sha256: "other" }, manifest, true)).toThrow("different checksum");
    expect(shouldApplyCatalog({ sequence: 2, sha256: manifest.sha256 }, manifest, false)).toBe(false);
    expect(shouldApplyCatalog({ sequence: 2, sha256: manifest.sha256 }, manifest, true)).toBe(true);
  });
  it.each(["publicId", "type", "difficulty"] as const)("refuses rewriting parent %s", field => {
    const changed = { ...localParent, [field]: "changed" };
    expect(() => assertCatalogIdentities(artifact, [changed], [localSong])).toThrow("parent identity");
  });
  it.each(["parentId", "region", "gameVersion"] as const)("refuses moving a child to another %s", field => {
    const changed = { ...localSong, [field]: field === "parentId" ? BigInt(1) : field === "gameVersion" ? 24 : "intl" };
    expect(() => assertCatalogIdentities(artifact, [localParent], [changed])).toThrow("child identity");
  });
  it("refuses identity reuse under different numeric IDs", () => {
    expect(() => assertCatalogIdentities(artifact, [{ ...localParent, id: BigInt(1) }], [])).toThrow("another ID");
    expect(() => assertCatalogIdentities(artifact, [], [{ ...localSong, id: BigInt(1) }])).toThrow("another ID");
  });
  it("permits catalog metadata updates without changing identity", () => {
    expect(() => assertCatalogIdentities({ ...artifact, parents: [{ ...parent, songName: "Renamed", disambiguator: 1, artist: "Updated", cover: "new.webp" }], songs: [{ ...song, levelPrecise: 135 }] }, [localParent], [localSong])).not.toThrow();
  });
});
