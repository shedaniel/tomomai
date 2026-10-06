import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { Region } from "@/lib/games/ids";
import { collectCatalog } from "@/server/services/catalog/ingestion/collect";
import { parseCatalogUpload } from "@/server/services/catalog/ingestion/parse-upload";
import { readChunithmNoteCounts } from "@/lib/games/chunithm/note-counts";
import jpFixture from "../fixtures/otoge-db-jp.json";
import intlFixture from "../fixtures/otoge-db-intl.json";

vi.mock("@/server/services/discord/webhook", () => ({ sendDiscordNotice: vi.fn(async () => {}) }));
const context = (region: Region, version = region === "jp" ? 9 : 8) => ({ region, version, session: { cookies: "" }, log: pino({ enabled: false }) });
const collectChunithm = (region: Region, version?: number) => collectCatalog("chunithm", context(region, version));
async function collect(records: Record<string, unknown>[], region: Region = "jp", version?: number) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(records)));
  return collectChunithm(region, version);
}
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-26T00:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("CHUNITHM otoge-db collection", () => {
  it("maps regular JP charts, preserving source constants and filling missing values with provenance", async () => {
    const charts = await collect(jpFixture);
    const alive = charts.filter(chart => chart.songName === "ALIVE");
    expect(alive).toHaveLength(4);
    expect(alive[0]).toMatchObject({ game: "chunithm", chartType: 0, difficulty: 0, level: "3", levelPrecise: 30, addedVersion: 4, metadata: { levelPreciseEstimated: true } });
    expect(alive[3]).toMatchObject({ difficulty: 3, level: "12+", levelPrecise: 126, bpm: 180, noteDesigner: "ヤナギ・リコイル",
      cover: "https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/jacket/b7ec25d973052f3c.jpg" });
    expect(alive[3].metadata).toStrictEqual({ source: { provider: "otoge-db", id: "2490" }, noteCounts: { tap: 625, hold: 174, slide: 206, air: 331, flick: 89 } });
    expect(readChunithmNoteCounts(alive[3].metadata)).toEqual({ tap: 625, hold: 174, slide: 206, air: 331, flick: 89 });
    const ultima = charts.find(chart => chart.songName === "ネ！コ！" && chart.difficulty === 4);
    expect(ultima).toMatchObject({ levelPrecise: 140, addedVersion: 3 });
    expect(ultima?.metadata).not.toHaveProperty("addedVersionEstimated");
    expect(charts.find(chart => chart.songName === "Melodiniq" && chart.difficulty === 4)).toMatchObject({ addedVersion: 9, metadata: { addedVersionEstimated: true } });
    expect(charts.some(chart => chart.songName === "ETERNAL DRAIN")).toBe(false);
    expect(charts.map(chart => chart.songName)).toEqual(charts.map(chart => chart.songName).toSorted((a, b) => a.localeCompare(b)));
    expect(parseCatalogUpload("chunithm", charts)).toEqual(charts);
  });
  it("uses regional availability and release dates without borrowing JP versions", async () => {
    const charts = await collect(intlFixture, "intl");
    expect(fetch).toHaveBeenCalledWith("https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/data/music-ex-intl.json", { signal: expect.any(AbortSignal), cache: "no-store" });
    expect(charts.find(chart => chart.songName === "Melodiniq" && chart.difficulty === 3)).toMatchObject({ addedVersion: 8 });
    expect(charts.find(chart => chart.songName === "ネ！コ！" && chart.difficulty === 4)).toMatchObject({ addedVersion: -7, metadata: { addedVersionEstimated: true } });
    const master = charts.find(chart => chart.songName === "ネ！コ！" && chart.difficulty === 3);
    expect(master).toMatchObject({ addedVersion: -7 });
    expect(master?.metadata).not.toHaveProperty("addedVersionEstimated");
    expect((await collect(jpFixture, "intl")).some(chart => chart.songName === "ALIVE")).toBe(false);
    const updated = await collect([{ ...intlFixture[1], date_intl_updated: "20260416" }], "intl");
    const updatedUltima = updated.find(chart => chart.difficulty === 4);
    expect(updatedUltima).toMatchObject({ addedVersion: 8 });
    expect(updatedUltima?.metadata).not.toHaveProperty("addedVersionEstimated");
  });
  it("uses the source version label to disambiguate tied regional release dates", async () => {
    const charts = await collect([{ ...intlFixture[1], version: "CHUNITHM STAR PLUS" }], "intl");
    expect(charts.find(chart => chart.difficulty === 3)?.addedVersion).toBe(-7);
  });
  it("keeps ambiguous BPM and absent note counts unknown", async () => {
    const charts = await collect([{ ...jpFixture[0], bpm: "440(MASTER譜面のみ220)", lev_mas_i: "-", lev_mas_notes_air: "-" }]);
    const chart = charts.find(chart => chart.difficulty === 3)!;
    expect(chart.bpm).toBeUndefined();
    expect(chart.metadata).toMatchObject({ levelPreciseEstimated: true, noteCounts: { tap: 625 } });
    expect(chart.metadata?.noteCounts).not.toHaveProperty("air");
    expect(readChunithmNoteCounts(chart.metadata)).toMatchObject({ tap: 625, air: null });
  });
  it("follows the canonical release rollover and rejects a stale requested version before fetching", async () => {
    vi.setSystemTime(new Date("2026-07-02T06:59:59+09:00"));
    expect(await collect([jpFixture[0]], "jp", 8)).toHaveLength(4);
    vi.setSystemTime(new Date("2026-07-02T07:00:00+09:00"));
    expect(await collect([jpFixture[0]], "jp", 9)).toHaveLength(4);
    vi.mocked(fetch).mockClear();
    await expect(collectChunithm("jp", 8)).rejects.toThrow("only supports version 9");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects unsupported regions before source work", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(collectChunithm("cn")).rejects.toMatchObject({ code: "UNSUPPORTED_REGION", game: "chunithm", region: "cn" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects an empty result", async () => { await expect(collect([])).rejects.toThrow("no regular CHUNITHM charts"); });
});
