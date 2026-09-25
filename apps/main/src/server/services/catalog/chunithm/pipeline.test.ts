import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogFetchContext, CatalogLogger } from "../ingestion/types";
import { chunithmCatalogAdapter } from "./pipeline";
import { normalizeOtogeDbCatalog } from "./sources/otoge-db";
import { sendDiscordNotice } from "@/server/services/catalog/notifications";
import jpFixture from "./fixtures/otoge-db-jp.json";
import intlFixture from "./fixtures/otoge-db-intl.json";

vi.mock("@/server/services/catalog/notifications", () => ({ sendDiscordNotice: vi.fn(async () => undefined) }));

function context(region: "jp" | "intl", version: number): CatalogFetchContext {
  const log: CatalogLogger = {
    child: () => log,
    trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  };
  return { region, version, log, notice: { addDetail: vi.fn(), details: [] } };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-26T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
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
      .toMatchObject({ addedVersion: -7, metadata: { addedVersionEstimated: false } });
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

  it.each([["無印", -12], ["PARADISE×", -1], ["CHUNITHM STAR PLUS", -7]] as const)
    ("uses canonical source label %s to disambiguate tied regional dates", (version, expected) => {
      const charts = normalizeOtogeDbCatalog([{ ...intlFixture[1], version }], "intl");
      expect(charts.find(chart => chart.difficulty === 3)?.addedVersion).toBe(expected);
    });

  it("keeps ambiguous BPM and absent chart metadata optional", () => {
    const record = { ...jpFixture[0], bpm: "440(MASTER譜面のみ220)", lev_mas_i: "-", lev_mas_notes_air: "-" };
    const chart = normalizeOtogeDbCatalog([record], "jp")[3];
    expect(chart.bpm).toBeUndefined();
    expect(chart.levelPrecise).toBeUndefined();
    expect(chart.metadata).toMatchObject({ otogeDb: { bpm: record.bpm, noteCounts: { tap: 625 } } });
    expect(chart.metadata).not.toMatchObject({ otogeDb: { noteCounts: { air: 0 } } });
  });

  it("supports only JP and International", () => {
    expect(() => normalizeOtogeDbCatalog(jpFixture, "cn")).toThrow("JP and International only");
  });
});

describe("CHUNITHM otoge-db collection", () => {
  it("runs the source through shared filling and finalization with separate estimate provenance", async () => {
    const fetcher = vi.fn(async () => Response.json(jpFixture));
    vi.stubGlobal("fetch", fetcher);
    const charts = await chunithmCatalogAdapter.collect!(context("jp", 9));
    const alive = charts.filter(chart => chart.songName === "ALIVE");
    expect(alive[0]).toMatchObject({ level: "3", levelPrecise: 30, metadata: { levelPreciseEstimated: true } });
    expect(alive[3]).toMatchObject({ level: "12+", levelPrecise: 126, metadata: { levelPreciseEstimated: false, otogeDb: { constant: "12.6" } } });
    expect(charts.every(chart => typeof chart.levelPrecise === "number")).toBe(true);
    expect(charts.every(chart => typeof chart.addedVersion === "number")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
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
    const fetcher = vi.fn(async () => Response.json(intlFixture));
    vi.stubGlobal("fetch", fetcher);
    const charts = await chunithmCatalogAdapter.collect!(context("intl", 8));
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

  it.each([
    { region: "jp", boundary: "2026-07-02T07:00:00+09:00", previous: 8, next: 9, song: jpFixture[0] },
    { region: "intl", boundary: "2026-04-16T07:00:00+09:00", previous: 7, next: 8, song: intlFixture[0] },
  ] as const)("follows the canonical $region release rollover without source configuration changes", async ({ region, boundary, previous, next, song }) => {
    const fetcher = vi.fn(async () => Response.json([song]));
    vi.stubGlobal("fetch", fetcher);
    vi.setSystemTime(new Date(new Date(boundary).getTime() - 1));
    expect(chunithmCatalogAdapter.resolveVersion!(region)).toBe(previous);
    expect(await chunithmCatalogAdapter.collect!(context(region, previous))).toHaveLength(4);
    vi.setSystemTime(new Date(boundary));
    expect(chunithmCatalogAdapter.resolveVersion!(region)).toBe(next);
    expect(await chunithmCatalogAdapter.collect!(context(region, next))).toHaveLength(4);
    fetcher.mockClear();
    await expect(chunithmCatalogAdapter.collect!(context(region, previous))).rejects.toThrow(`only supports version ${next}`);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails on HTTP errors before accepting a partial catalog", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Unavailable", { status: 503 })));
    await expect(chunithmCatalogAdapter.collect!(context("jp", 9))).rejects.toThrow("HTTP 503");
  });

  it("rejects an empty provider result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    await expect(chunithmCatalogAdapter.collect!(context("jp", 9))).rejects.toThrow("no regular CHUNITHM charts");
  });

  it("leaves required-field validation to shared finalization", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([{ ...jpFixture[0], date_added: "" }])));
    await expect(chunithmCatalogAdapter.collect!(context("jp", 9))).rejects.toThrow("Errors occurred during song update");
    expect(sendDiscordNotice).not.toHaveBeenCalledWith("jp", "CHUNITHM Fetch pipeline completed", expect.any(String), expect.any(Number));
  });
});
