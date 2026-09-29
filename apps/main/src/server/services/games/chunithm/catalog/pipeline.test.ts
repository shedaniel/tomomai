import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { Region } from "@/lib/types";
import { collectChunithmCatalog } from "./pipeline";
import { sendDiscordNotice } from "@/server/services/discord/webhook";
import jpFixture from "./fixtures/otoge-db-jp.json";
import intlFixture from "./fixtures/otoge-db-intl.json";

vi.mock("@/server/services/discord/webhook", () => ({ sendDiscordNotice: vi.fn(async () => {}) }));
const context = (region: Region, version = region === "jp" ? 9 : 8) => ({ region, version, log: pino({ enabled: false }), notice: { addDetail: vi.fn(), details: [] } });
async function collect(records: Record<string, unknown>[], region: Region = "jp", version?: number) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(records)));
  return collectChunithmCatalog(context(region, version));
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
      cover: "https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/jacket/b7ec25d973052f3c.jpg",
      metadata: { levelPreciseEstimated: false, otogeDb: { id: "2490", constant: "12.6", totalNotes: 1425, noteCounts: { tap: 625, air: 331 } } } });
    expect(charts.find(chart => chart.songName === "ネ！コ！" && chart.difficulty === 4)).toMatchObject({ levelPrecise: 140, addedVersion: 3,
      metadata: { addedVersionEstimated: false, otogeDb: { chartAddedDateSource: "regional-update" } } });
    expect(charts.find(chart => chart.songName === "Melodiniq" && chart.difficulty === 4)).toMatchObject({ addedVersion: 9, metadata: { addedVersionEstimated: true } });
    expect(charts.some(chart => chart.songName === "ETERNAL DRAIN")).toBe(false);
    expect(charts.map(chart => chart.songName)).toEqual(charts.map(chart => chart.songName).toSorted((a, b) => a.localeCompare(b)));
  });
  it("uses regional availability and release dates without borrowing JP versions", async () => {
    const charts = await collect(intlFixture, "intl");
    expect(fetch).toHaveBeenCalledWith("https://raw.githubusercontent.com/zvuc/otoge-db/main/chunithm/data/music-ex-intl.json", { signal: expect.any(AbortSignal), cache: "no-store" });
    expect(charts.find(chart => chart.songName === "Melodiniq" && chart.difficulty === 3)).toMatchObject({ addedVersion: 8 });
    expect(charts.find(chart => chart.songName === "ネ！コ！" && chart.difficulty === 4)).toMatchObject({ addedVersion: -7, metadata: { addedVersionEstimated: true } });
    expect(charts.find(chart => chart.songName === "ネ！コ！" && chart.difficulty === 3)).toMatchObject({ addedVersion: -7, metadata: { addedVersionEstimated: false } });
    expect((await collect(jpFixture, "intl")).some(chart => chart.songName === "ALIVE")).toBe(false);
    const updated = await collect([{ ...intlFixture[1], date_intl_updated: "20260416" }], "intl");
    expect(updated.find(chart => chart.difficulty === 4)).toMatchObject({ addedVersion: 8, metadata: { addedVersionEstimated: false } });
  });
  it("uses the source version label to disambiguate tied regional release dates", async () => {
    const charts = await collect([{ ...intlFixture[1], version: "CHUNITHM STAR PLUS" }], "intl");
    expect(charts.find(chart => chart.difficulty === 3)?.addedVersion).toBe(-7);
  });
  it("keeps ambiguous BPM and absent note counts unknown", async () => {
    const charts = await collect([{ ...jpFixture[0], bpm: "440(MASTER譜面のみ220)", lev_mas_i: "-", lev_mas_notes_air: "-" }]);
    const chart = charts.find(chart => chart.difficulty === 3)!;
    expect(chart.bpm).toBeUndefined();
    expect(chart.metadata).toMatchObject({ levelPreciseEstimated: true, otogeDb: { noteCounts: { tap: 625 } } });
    expect(chart.metadata).not.toMatchObject({ otogeDb: { noteCounts: { air: 0 } } });
  });
  it("follows the canonical release rollover and rejects a stale requested version before fetching", async () => {
    vi.setSystemTime(new Date("2026-07-02T06:59:59+09:00"));
    expect(await collect([jpFixture[0]], "jp", 8)).toHaveLength(4);
    vi.setSystemTime(new Date("2026-07-02T07:00:00+09:00"));
    expect(await collect([jpFixture[0]], "jp", 9)).toHaveLength(4);
    vi.mocked(fetch).mockClear();
    await expect(collectChunithmCatalog(context("jp", 8))).rejects.toThrow("only supports version 9");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects unsupported regions before source work", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(collectChunithmCatalog(context("cn"))).rejects.toMatchObject({ code: "UNSUPPORTED_REGION", game: "chunithm", region: "cn" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("propagates provider HTTP failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Unavailable", { status: 503 })));
    await expect(collectChunithmCatalog(context("jp"))).rejects.toThrow("HTTP 503");
  });
  it("rejects an empty result", async () => { await expect(collect([])).rejects.toThrow("no regular CHUNITHM charts"); });
  it("rejects incomplete charts at finalization without sending a completion notice", async () => {
    await expect(collect([{ ...jpFixture[0], date_added: "" }])).rejects.toThrow("Errors occurred during song update");
    expect(sendDiscordNotice).not.toHaveBeenCalledWith("chunithm", "jp", "Fetch pipeline completed", expect.any(String), expect.any(Number));
  });
});
