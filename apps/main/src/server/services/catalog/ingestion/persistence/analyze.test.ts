import { describe, expect, it } from "vitest";
import type { CatalogChart } from "../schema";
import { analyzeChanges, parseCatalogUpdateMode, type StoredChart } from "./analyze";

const chart: CatalogChart = {
  game: "chunithm", songName: "Song", chartType: 0, difficulty: 4, artist: "Artist", cover: "image",
  genre: "Original", level: "14+", levelPrecise: 145, addedVersion: 8, metadata: { source: { provider: "otoge-db", id: "123" } },
};
const stored = (overrides: Partial<CatalogChart> = {}): StoredChart =>
  ({ id: BigInt(12), parentId: BigInt(5), chart: { ...chart, ...overrides } });

describe("change analysis", () => {
  it("keeps the stored parent attributes when another instance of the parent is preferred", () => {
    const incoming = { ...chart, artist: "Renamed", cover: "new", genre: "Variety", bpm: 200, level: "15" };
    const [preferred] = analyzeChanges([stored()], [incoming], new Set()).merged;
    expect(preferred.fieldChanges.map(change => change.field)).toEqual(["artist", "cover", "genre", "bpm", "level"]);

    const [nonPreferred] = analyzeChanges([stored()], [incoming], new Set([BigInt(5)])).merged;
    expect(nonPreferred.chart).toMatchObject({ artist: "Artist", cover: "image", genre: "Original", bpm: undefined, level: "15" });
    expect(nonPreferred.fieldChanges).toEqual([{ field: "level", oldValue: "14+", newValue: "15" }]);
  });

  it.each([
    ["stored null metadata", undefined, undefined],
    ["stored null metadata", undefined, {}],
    ["stored empty metadata", {}, undefined],
  ])("treats %s as the same as incoming %j", (_name, storedMetadata, incomingMetadata) => {
    const [entry] = analyzeChanges([stored({ metadata: storedMetadata })], [{ ...chart, metadata: incomingMetadata }], new Set()).merged;
    expect(entry.fieldChanges).toEqual([]);
  });

  it.each([
    { label: "reordered nested object keys", incoming: { source: { provider: "otoge-db", id: "123" }, noteCounts: { air: 2, tap: 1 } }, changed: false },
    { label: "omitted optional JSON values", incoming: { source: { provider: "otoge-db", id: "123" }, noteCounts: { tap: 1, air: 2 }, addedVersionEstimated: undefined }, changed: false },
    { label: "changed nested value", incoming: { source: { provider: "otoge-db", id: "123" }, noteCounts: { tap: 3, air: 2 } }, changed: true },
  ] as const)("compares metadata as stored JSON with $label", ({ incoming, changed }) => {
    const existing = stored({ metadata: { noteCounts: { tap: 1, air: 2 }, source: { id: "123", provider: "otoge-db" } } });
    const [entry] = analyzeChanges([existing], [{ ...chart, metadata: incoming }], new Set()).merged;
    expect(entry.fieldChanges.map(change => change.field)).toEqual(changed ? ["metadata"] : []);
  });
});

describe("update modes", () => {
  it("previews an upload whose update mode is missing or unknown", () => {
    expect(parseCatalogUpdateMode(null)).toBe("noop");
    expect(parseCatalogUpdateMode("delete")).toBe("noop");
    expect(parseCatalogUpdateMode("destructive")).toBe("destructive");
  });
});
