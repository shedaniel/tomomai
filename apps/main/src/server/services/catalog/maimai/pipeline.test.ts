import { beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { PendingSong } from "@/server/services/catalog/maimai/types";
import { value } from "@/server/services/catalog/ingestion/types";

const state = vi.hoisted(() => ({ order: [] as string[], incomplete: false }));
function fixtureStep(name: string) {
  return async (_context: unknown, songs: PendingSong[]): Promise<PendingSong[]> => {
    state.order.push(name);
    if (songs.length) return songs;
    return ["Z", "A"].map(songName => ({ songName, type: "dx", difficulty: "master", level: "14+",
      artist: state.incomplete ? undefined : "Artist", cover: "image", genre: "Original", addedVersion: 8 }));
  };
}
vi.mock("./sources/scraper", () => ({ MaimaiScraperFetcher: fixtureStep("scraper") }));
vi.mock("./sources/base-songs", () => ({ MaimaiBaseFetcher: fixtureStep("base") }));
vi.mock("./sources/dxrating", () => ({ DxDataFetcher: fixtureStep("dxdata") }));
vi.mock("./sources/fallback", () => ({ FallbackFetcher: fixtureStep("fallback") }));
vi.mock("./sources/otoge-db", () => ({ OtogeDbFetcher: fixtureStep("otoge") }));
vi.mock("./sources/after-fetch", () => ({ MaimaiAfterFetcher: fixtureStep("after") }));
vi.mock("./sources/lxns", () => ({ LxnsFetcher: fixtureStep("lxns") }));
vi.mock("../notifications", () => ({ sendDiscordNotice: vi.fn().mockResolvedValue(undefined) }));
import { fetchLevels, getFetchersForRegion } from "./pipeline";
import { sendDiscordNotice } from "../notifications";

beforeEach(() => { state.order = []; state.incomplete = false; vi.clearAllMocks(); });
const context = (region: "jp" | "intl" | "cn") => ({ region, version: 9 as const, cookies: "",
  log: pino({ enabled: false }), notice: { details: [], addDetail: vi.fn() } });

describe("maimai configured fetcher pipeline", () => {
  it.each(["jp", "intl"] as const)("preserves %s source order and runs shared fill/sort/finalization", async region => {
    expect(getFetchersForRegion(region).names).toEqual([
      "Maimai Scraper", "Maimai Base Songs", "DxData", "Fallback", "OtogeDB", "Maimai After Fetch", "Fill Missing", "Sorter",
    ]);
    const result = await fetchLevels(context(region));
    expect(state.order).toEqual(["scraper", "base", "dxdata", "fallback", "otoge", "after"]);
    expect(result.map(song => song.songName)).toEqual(["A", "Z"]);
    expect(result.every(song => song.levelPrecise === 146 && song.addedVersion === 8)).toBe(true);
    expect(result[0].metadata?.levelPreciseEstimated).toBe(true);
    expect(sendDiscordNotice).toHaveBeenCalledTimes(9);
    expect(sendDiscordNotice).toHaveBeenCalledWith(region, "Stage 7/8: Fill Missing", expect.stringContaining("2 missing"), expect.any(Number));
  });

  it("retains the separate CN source recipe with the same fill/sort steps", async () => {
    expect(getFetchersForRegion("cn").names).toEqual(["Lxns", "Fill Missing", "Sorter"]);
    const result = await fetchLevels(context("cn"));
    expect(state.order).toEqual(["lxns"]);
    expect(value(result[0].levelPrecise)).toBe(146);
    expect(sendDiscordNotice).toHaveBeenCalledTimes(4);
  });

  it("fails shared finalization rather than returning incomplete provider records", async () => {
    state.incomplete = true;
    await expect(fetchLevels(context("jp"))).rejects.toThrow("Errors occurred during song update");
    expect(sendDiscordNotice).not.toHaveBeenCalledWith("jp", "Fetch pipeline completed", expect.any(String), expect.any(Number));
  });
});
