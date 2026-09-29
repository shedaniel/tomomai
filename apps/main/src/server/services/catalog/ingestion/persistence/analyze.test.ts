import { describe, expect, it } from "vitest";
import type { CatalogChart } from "../schema";
import {
  analyzeChanges,
  describeChanges,
  parseCatalogUpdateMode,
  planDeletions,
  toInstanceValues,
  toStoredChart,
  type DeletedChange,
  type StoredChart,
  type StoredChartRow,
} from "./analyze";

const chart: CatalogChart = {
  game: "chunithm", songName: "Song", chartType: 0, difficulty: 4, artist: "Artist", cover: "image",
  genre: "Original", level: "14+", levelPrecise: 145, addedVersion: 8, metadata: { otogeDb: { id: "123" } },
};
const stored = (overrides: Partial<CatalogChart> = {}, id = 12, parentId = 5): StoredChart =>
  ({ id: BigInt(id), parentId: BigInt(parentId), chart: { ...chart, ...overrides } });

describe("stored chart rows", () => {
  it("round-trips every instance column through a stored chart", () => {
    const row = {
      id: BigInt(12), parentId: BigInt(5), publicId: "Ab3xK9pQ", game: "maimai", songName: "Song", type: 1, difficulty: 3,
      disambiguator: 0, artist: "Artist", cover: "image", genre: "maimai", bpm: 180, region: "jp", gameVersion: 11,
      level: "13+", levelPrecise: 137, addedVersion: 10, noteDesigner: "Designer", metadata: { source: "a" },
      tapCount: 1, holdCount: 2, slideCount: 3, touchCount: 4, breakCount: 5,
    } satisfies StoredChartRow;
    const { id, parentId, chart: restored } = toStoredChart(row);
    const { publicId: _publicId, disambiguator: _disambiguator, songName: _songName, type: _type, difficulty: _difficulty,
      artist: _artist, cover: _cover, genre: _genre, bpm: _bpm, id: _id, ...instance } = row;
    expect(toInstanceValues("maimai", restored, parentId, row)).toEqual(instance);
    expect(id).toBe(row.id);
  });

  it("reads absent optional values as undefined", () => {
    const { chart: restored } = toStoredChart({
      id: BigInt(12), parentId: BigInt(5), publicId: "Ab3xK9pQ", game: "chunithm", songName: "Song", type: 0, difficulty: 4,
      disambiguator: 0, artist: "Artist", cover: "image", genre: "Original", bpm: null, region: "jp", gameVersion: 9,
      level: "14+", levelPrecise: 145, addedVersion: 8, noteDesigner: null, metadata: null,
      tapCount: null, holdCount: null, slideCount: null, touchCount: null, breakCount: null,
    });
    expect(restored).toEqual({ ...chart, metadata: undefined });
  });
});

describe("change analysis", () => {
  it("rejects an incoming chart that could be either of two stored charts", () => {
    expect(() => analyzeChanges([stored({ artist: "A" }), stored({ artist: "B" }, 13, 6)], [chart], new Set()))
      .toThrow(`Ambiguous catalog identity: ${JSON.stringify(["chunithm", "Song", 0, 4])}`);
  });

  it("separates added, merged and removed charts", () => {
    const kept = stored();
    const removed = stored({ songName: "Gone" }, 13, 6);
    const incoming = { ...chart, songName: "New" };
    const analysis = analyzeChanges([kept, removed], [chart, incoming], new Set());
    expect(analysis.added).toEqual([incoming]);
    expect(analysis.merged).toEqual([{ stored: kept, chart, fieldChanges: [] }]);
    expect(analysis.removed).toEqual([removed]);
  });

  it("keeps the stored parent attributes when another instance of the parent is preferred", () => {
    const incoming = { ...chart, artist: "Renamed", cover: "new", genre: "Variety", bpm: 200, level: "15" };
    const [preferred] = analyzeChanges([stored()], [incoming], new Set()).merged;
    expect(preferred.fieldChanges.map(change => change.field)).toEqual(["artist", "cover", "genre", "bpm", "level"]);

    const [nonPreferred] = analyzeChanges([stored()], [incoming], new Set([BigInt(5)])).merged;
    expect(nonPreferred.chart).toMatchObject({ artist: "Artist", cover: "image", genre: "Original", bpm: undefined, level: "15" });
    expect(nonPreferred.fieldChanges).toEqual([{ field: "level", oldValue: "14+", newValue: "15" }]);
  });

  it("treats stored null metadata as absent", () => {
    const [entry] = analyzeChanges([stored({ metadata: undefined })], [{ ...chart, metadata: undefined }], new Set()).merged;
    expect(entry.fieldChanges).toEqual([]);
  });

  it.each([
    { label: "reordered nested object keys", incoming: { source: { title: "Song", id: "123" }, notes: [1, 2] }, changed: false },
    { label: "omitted optional JSON values", incoming: { source: { title: "Song", id: "123", optional: undefined }, notes: [1, 2] }, changed: false },
    { label: "changed nested value", incoming: { source: { title: "Changed", id: "123" }, notes: [1, 2] }, changed: true },
    { label: "reordered array items", incoming: { source: { title: "Song", id: "123" }, notes: [2, 1] }, changed: true },
  ])("compares metadata as stored JSON with $label", ({ incoming, changed }) => {
    const existing = stored({ metadata: { notes: [1, 2], source: { id: "123", title: "Song" } } });
    const [entry] = analyzeChanges([existing], [{ ...chart, metadata: incoming }], new Set()).merged;
    expect(entry.fieldChanges.map(change => change.field)).toEqual(changed ? ["metadata"] : []);
  });
});

describe("change records", () => {
  it("describes each change and counts the references of removed charts", () => {
    const changed = stored();
    const unchanged = stored({ difficulty: 3 }, 14, 7);
    const removed = stored({ songName: "Gone" }, 13, 6);
    const analysis = analyzeChanges([changed, unchanged, removed], [{ ...chart, level: "15" }, unchanged.chart, { ...chart, songName: "New" }], new Set());
    const changes = describeChanges(analysis, new Map([[BigInt(13), 2]]));
    expect(changes.added).toEqual([{ songKey: JSON.stringify(["chunithm", "New", 0, 4]), songName: "New", difficulty: 4, chartType: 0,
      level: "14+", levelPrecise: 145, artist: "Artist" }]);
    expect(changes.modified).toEqual([{ songKey: JSON.stringify(["chunithm", "Song", 0, 4]), songName: "Song", difficulty: 4, chartType: 0,
      fieldChanges: [{ field: "level", oldValue: "14+", newValue: "15" }], dbId: "12" }]);
    expect(changes.unchanged).toEqual([JSON.stringify(["chunithm", "Song", 0, 3])]);
    expect(changes.deleted).toEqual([expect.objectContaining({ songName: "Gone", dbId: "13", playRecordCount: 2 })]);
    expect(describeChanges(analysis, new Map()).deleted[0].playRecordCount).toBe(0);
  });
});

describe("deletion plans", () => {
  const referenced = { dbId: "1", playRecordCount: 3 } as DeletedChange;
  const unreferenced = { dbId: "2", playRecordCount: 0 } as DeletedChange;

  it.each([
    { mode: "noop", apply: [], skip: [referenced] },
    { mode: "alter", apply: [unreferenced], skip: [referenced] },
    { mode: "destructive", apply: [referenced, unreferenced], skip: [] },
  ] as const)("in $mode mode deletes $apply.length and keeps $skip.length referenced charts", ({ mode, apply, skip }) => {
    expect(planDeletions([referenced, unreferenced], mode)).toEqual({ apply, skip });
  });

  it("previews an upload whose update mode is missing or unknown", () => {
    expect(parseCatalogUpdateMode(null)).toBe("noop");
    expect(parseCatalogUpdateMode("delete")).toBe("noop");
    expect(parseCatalogUpdateMode("destructive")).toBe("destructive");
  });
});
