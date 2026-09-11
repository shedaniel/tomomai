import { beforeEach, describe, expect, it, vi } from "vitest";

const { rows, query, warn } = vi.hoisted(() => ({
  rows: [] as { id: bigint; songName: string; difficulty: string; type: string; artist: string }[],
  query: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: { select: () => ({ from: () => ({ innerJoin: () => ({ where: query }) }) }) },
}));
vi.mock("../../request-logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn }),
}));

import { buildSongLookupMaps } from "./persist";

describe("score catalog lookup", () => {
  beforeEach(() => {
    rows.length = 0;
    warn.mockClear();
    query.mockImplementation(async () => rows);
  });

  it("omits an ambiguous name across every duplicate while preserving all instance rows", async () => {
    rows.push(
      { id: BigInt(1), songName: "Shared", difficulty: "master", type: "dx", artist: "A" },
      { id: BigInt(2), songName: "Shared", difficulty: "master", type: "dx", artist: "B" },
      { id: BigInt(3), songName: "Shared", difficulty: "master", type: "dx", artist: "C" },
      { id: BigInt(4), songName: "Shared", difficulty: "expert", type: "dx", artist: "A" },
    );
    const { songLookup, fullSongMap } = await buildSongLookupMaps("intl", 25);
    expect(songLookup.has("Shared|master|dx")).toBe(false);
    expect(songLookup.get("Shared|expert|dx")).toBe(BigInt(4));
    expect(fullSongMap.size).toBe(4);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("resolves unambiguous charts regardless of row order", async () => {
    rows.push(
      { id: BigInt(8), songName: "Second", difficulty: "master", type: "dx", artist: "B" },
      { id: BigInt(7), songName: "First", difficulty: "master", type: "std", artist: "A" },
    );
    const { songLookup } = await buildSongLookupMaps("jp", 26);
    expect(songLookup.get("First|master|std")).toBe(BigInt(7));
    expect(songLookup.get("Second|master|dx")).toBe(BigInt(8));
    expect(warn).not.toHaveBeenCalled();
  });
});
