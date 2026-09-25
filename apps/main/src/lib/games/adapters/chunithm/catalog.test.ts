import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogFetchContext, CatalogLogger } from "../../catalog-types";
import { chunithmCatalogAdapter } from "./catalog";
import { normalizeOtogeDbCatalog, validateOtogeDbVersionMetadata } from "./otoge-db";
import { sendDiscordNotice } from "@/server/services/admin/discord-webhooks";
import jpFixture from "./fixtures/otoge-db-jp.json";
import intlFixture from "./fixtures/otoge-db-intl.json";

vi.mock("@/server/services/admin/discord-webhooks", () => ({ sendDiscordNotice: vi.fn(async () => undefined) }));

const versionMetadata = 'CURRENT_JP_VER = "Mate"\nCURRENT_INTL_VER = "X-VERSE-X"\n';

function context(region: "jp" | "intl", version: number): CatalogFetchContext {
  const log: CatalogLogger = {
    child: () => log,
    trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  };
  return { region, version, log, notice: { addDetail: vi.fn(), details: [] } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CHUNITHM otoge-db normalization", () => {
  it("maps real JP BASIC–ULTIMA charts and preserves constants independently of display levels", () => {
    const charts = normalizeOtogeDbCatalog(jpFixture, "jp");
    const alive = charts.filter(chart => chart.songName === "ALIVE");
    expect(alive).toHaveLength(4);
    expect(alive[0]).toMatchObject({ game: "chunithm", chartType: 0, difficulty: 0, level: "3", addedVersion: 4 });
    expect(alive[0].levelPrecise).toBeUndefined();
    expect(alive[3]).toMatchObject({ difficulty: 3, level: "12+", levelPrecise: 126, bpm: 180, noteDesigner: "ヤナギ・リコイル" });
    expect(alive[3].cover).toBe("https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/jacket/b7ec25d973052f3c.jpg");
    expect(alive[3].metadata).toMatchObject({ otogeDb: {
      id: "2490", version: "LUMINOUS", totalNotes: 1425,
      noteCounts: { tap: 625, hold: 174, slide: 206, air: 331, flick: 89 },
    } });
    expect(charts.find(chart => chart.songName === "ネ！コ！" && chart.difficulty === 4))
      .toMatchObject({ chartType: 0, level: "14", levelPrecise: 140, addedVersion: 3 });
    expect(charts.some(chart => chart.songName === "ETERNAL DRAIN")).toBe(false);
  });

  it("uses regional availability and release dates without borrowing the JP version", () => {
    const charts = normalizeOtogeDbCatalog(intlFixture, "intl");
    expect(charts.find(chart => chart.songName === "Melodiniq" && chart.difficulty === 3))
      .toMatchObject({ addedVersion: 8, metadata: { otogeDb: { version: "Mate", dateIntlAdded: "20260820" } } });
    expect(normalizeOtogeDbCatalog(jpFixture, "intl").some(chart => chart.songName === "ALIVE")).toBe(false);
    expect(charts.find(chart => chart.songName === "ネ！コ！" && chart.difficulty === 4))
      .toMatchObject({ addedVersion: -7, metadata: { addedVersionEstimated: true } });
    expect(charts.find(chart => chart.songName === "ネ！コ！" && chart.difficulty === 3))
      .toMatchObject({ addedVersion: -7, metadata: { addedVersionEstimated: true } });
    expect(charts.find(chart => chart.songName === "Melodiniq" && chart.difficulty === 4))
      .toMatchObject({ addedVersion: 8, metadata: { addedVersionEstimated: true, otogeDb: { chartAddedDate: "20260820", chartAddedDateSource: "regional-song" } } });
  });

  it("prefers ULTIMA's regional update date and falls back to the regional song release", () => {
    const jp = normalizeOtogeDbCatalog(jpFixture, "jp");
    expect(jp.find(chart => chart.songName === "ネ！コ！" && chart.difficulty === 4))
      .toMatchObject({ addedVersion: 3, metadata: { addedVersionEstimated: false, otogeDb: { chartAddedDateSource: "regional-update" } } });
    expect(jp.find(chart => chart.songName === "Melodiniq" && chart.difficulty === 4))
      .toMatchObject({ addedVersion: 9, metadata: { addedVersionEstimated: true } });
    const intl = normalizeOtogeDbCatalog([{ ...intlFixture[1], date_intl_updated: "20260416" }], "intl");
    expect(intl.find(chart => chart.difficulty === 4))
      .toMatchObject({ addedVersion: 8, metadata: { addedVersionEstimated: false } });
  });

  it("rejects missing release dates and source versions that cannot disambiguate the regional release", () => {
    expect(() => normalizeOtogeDbCatalog([{ ...jpFixture[0], date_added: "" }], "jp")).toThrow("Missing");
    expect(() => normalizeOtogeDbCatalog([{ ...jpFixture[0], date_added: "20100101" }], "jp")).toThrow("Cannot resolve");
    expect(() => normalizeOtogeDbCatalog([{ ...intlFixture[0], version: "Mate", date_intl_added: "20210101" }], "intl")).toThrow("Cannot resolve");
  });

  it("does not coerce ambiguous BPM, missing note counts, or uncertain chart constants", () => {
    const record = { ...jpFixture[0], bpm: "440(MASTER譜面のみ220)", lev_mas_i: "-", lev_mas_notes_air: "-" };
    const chart = normalizeOtogeDbCatalog([record], "jp")[3];
    expect(chart.bpm).toBeUndefined();
    expect(chart.levelPrecise).toBeUndefined();
    expect(chart.metadata).toMatchObject({ otogeDb: { bpm: record.bpm, noteCounts: { tap: 625 } } });
    expect(chart.metadata).not.toMatchObject({ otogeDb: { noteCounts: { air: 0 } } });
  });

  it.each([
    { version: "UNKNOWN" },
    { lev_mas_i: "14.2?" },
    { lev_mas: "14?" },
    { lev_new: "15" },
    { date_added: "20260230" },
    { id: 2490 },
    { image: "../../other.jpg" },
  ])("rejects malformed or unsupported source fields: %j", changes => {
    expect(() => normalizeOtogeDbCatalog([{ ...jpFixture[0], ...changes }], "jp")).toThrow();
  });

  it("rejects duplicate identities, empty catalogs and unsupported regions", () => {
    expect(() => normalizeOtogeDbCatalog([jpFixture[0], jpFixture[0]], "jp")).toThrow("Ambiguous");
    expect(() => normalizeOtogeDbCatalog([jpFixture[0], { ...jpFixture[0], id: "9999" }], "jp")).toThrow("Ambiguous");
    expect(() => normalizeOtogeDbCatalog([], "jp")).toThrow();
    expect(() => normalizeOtogeDbCatalog(jpFixture, "cn")).toThrow("JP and International only");
  });
});

describe("CHUNITHM otoge-db collection", () => {
  it("runs the source through shared filling and finalization with separate estimate provenance", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("game.py")
      ? new Response(versionMetadata)
      : Response.json(jpFixture)));
    const charts = await chunithmCatalogAdapter.collect!(context("jp", 9));
    const alive = charts.filter(chart => chart.songName === "ALIVE");
    expect(alive[0]).toMatchObject({ level: "3", levelPrecise: 30, metadata: { levelPreciseEstimated: true } });
    expect(alive[3]).toMatchObject({ level: "12+", levelPrecise: 126, metadata: { levelPreciseEstimated: false, otogeDb: { constant: "12.6" } } });
    expect(charts.every(chart => typeof chart.levelPrecise === "number")).toBe(true);
    expect(charts.every(chart => typeof chart.addedVersion === "number")).toBe(true);
    expect(chunithmCatalogAdapter.getStages!("jp").names).toEqual(["OtogeDB", "Fill Missing", "Sorter"]);
    expect(vi.mocked(sendDiscordNotice).mock.calls.map(call => call[1])).toEqual([
      "CHUNITHM Stage 1/3: OtogeDB", "CHUNITHM Stage 2/3: Fill Missing",
      "CHUNITHM Stage 3/3: Sorter", "CHUNITHM Fetch pipeline completed",
    ]);
    const missingConstants = normalizeOtogeDbCatalog(jpFixture, "jp").filter(chart => chart.levelPrecise === undefined).length;
    expect(vi.mocked(sendDiscordNotice).mock.calls[0][2]).toContain(`+${charts.length} added, ~0 modified`);
    expect(vi.mocked(sendDiscordNotice).mock.calls[1][2]).toContain(`+0 added, ~${missingConstants} modified`);
    expect(vi.mocked(sendDiscordNotice).mock.calls[2][2]).toContain("+0 added, ~0 modified");
    expect(charts.map(chart => chart.songName)).toEqual(charts.map(chart => chart.songName).toSorted((a, b) => a.localeCompare(b)));
  });

  it("collects from the requested regional source without cookies", async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith("game.py")
      ? new Response(versionMetadata)
      : Response.json(intlFixture));
    vi.stubGlobal("fetch", fetcher);
    const ctx = context("intl", 8);
    const charts = await chunithmCatalogAdapter.collect!(ctx);
    expect(charts.length).toBeGreaterThan(0);
    expect(fetcher).toHaveBeenCalledWith("https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/data/music-ex-intl.json", {
      signal: expect.any(AbortSignal), cache: "no-store",
    });
    expect(sendDiscordNotice).toHaveBeenCalledWith("intl", "CHUNITHM Stage 1/3: OtogeDB", expect.stringContaining("WORLD'S END excluded"), expect.any(Number));
    expect(chunithmCatalogAdapter.requiresToken).toBeUndefined();
    expect(chunithmCatalogAdapter.authenticate).toBeUndefined();
    expect(chunithmCatalogAdapter.resolveVersion!("jp")).toBe(9);
    expect(chunithmCatalogAdapter.resolveVersion!("intl")).toBe(8);
  });

  it("rejects historical catalog requests before fetching", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(chunithmCatalogAdapter.collect!(context("jp", 8))).rejects.toThrow("only supports version 9");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails on HTTP errors before accepting a partial catalog", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Unavailable", { status: 503 })));
    await expect(chunithmCatalogAdapter.collect!(context("jp", 9))).rejects.toThrow("HTTP 503");
  });

  it.each(["", 'CURRENT_JP_VER = "Future"', 'CURRENT_JP_VER = "X-VERSE-X"'])
    ("rejects missing, unknown, or changed source release metadata: %s", metadata => {
      expect(() => validateOtogeDbVersionMetadata(metadata, "jp", 9)).toThrow("does not match configured version");
    });

  it("recognizes the provider's explicit regional release declarations", () => {
    expect(() => validateOtogeDbVersionMetadata(versionMetadata, "jp", 9)).not.toThrow();
    expect(() => validateOtogeDbVersionMetadata(versionMetadata, "intl", 8)).not.toThrow();
  });
});
