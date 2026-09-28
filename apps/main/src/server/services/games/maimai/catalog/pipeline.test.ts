import { beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { PendingSong, SongFetcher } from "./types";
import { asFetcher } from "./merge";
import { important } from "@/server/services/catalog/ingestion/types";

const state = vi.hoisted(() => ({ incomplete: false }));
function fixtureStep(fields: Partial<PendingSong>): SongFetcher {
  return async (context, songs) => asFetcher(async () => ["Z", "A"].map(songName => ({
    songName, type: "dx", difficulty: "master", level: "14+", ...fields,
    ...(state.incomplete ? { cover: undefined } : {}),
  })))(context, songs);
}
vi.mock("./sources/scraper", () => ({ MaimaiScraperFetcher: (...args: Parameters<SongFetcher>) => fixtureStep({ addedVersion: important(8) })(...args) }));
vi.mock("./sources/base-songs", () => ({ MaimaiBaseFetcher: (...args: Parameters<SongFetcher>) => fixtureStep({ artist: important("Official artist"), genre: important("maimai"), cover: "official.jpg" })(...args) }));
vi.mock("./sources/dxrating", () => ({ DxDataFetcher: (...args: Parameters<SongFetcher>) => fixtureStep({ bpm: 180, noteDesigner: "Early designer" })(...args) }));
vi.mock("./sources/fallback", () => ({ FallbackFetcher: (...args: Parameters<SongFetcher>) => fixtureStep({ noteDesigner: "Corrected designer" })(...args) }));
vi.mock("./sources/otoge-db", () => ({ OtogeDbFetcher: (...args: Parameters<SongFetcher>) => fixtureStep({ artist: "Fallback artist", addedVersion: 7 })(...args) }));
vi.mock("./sources/after-fetch", () => ({ MaimaiAfterFetcher: (...args: Parameters<SongFetcher>) => fixtureStep({ noteCounts: { tap: 100, hold: 1, slide: 2, touch: 3, break: 4 } })(...args) }));
vi.mock("./sources/lxns", () => ({ LxnsFetcher: (...args: Parameters<SongFetcher>) => fixtureStep({ artist: "CN artist", genre: "maimai", cover: "cn.jpg", addedVersion: 8 })(...args) }));
vi.mock("@/server/services/discord/webhook", () => ({ sendDiscordNotice: vi.fn(async () => {}) }));
import { fetchLevels } from "./pipeline";
import { sendDiscordNotice } from "@/server/services/discord/webhook";

beforeEach(() => { state.incomplete = false; vi.clearAllMocks(); });
const context = (region: "jp" | "intl" | "cn") => ({ region, version: 9 as const, cookies: "", log: pino({ enabled: false }), notice: { details: [], addDetail: vi.fn() } });

describe("maimai catalog recipe", () => {
  it.each(["jp", "intl"] as const)("preserves %s source precedence, enrichment and final filling", async region => {
    const result = await fetchLevels(context(region));
    expect(result.map(song => song.songName)).toEqual(["A", "Z"]);
    expect(result[0]).toMatchObject({ artist: "Official artist", addedVersion: 8, bpm: 180,
      noteDesigner: "Corrected designer", noteCounts: { tap: 100, touch: 3 },
      levelPrecise: 146, metadata: { levelPreciseEstimated: true } });
  });
  it("uses the CN provider and the shared fill stage", async () => {
    expect((await fetchLevels(context("cn")))[0]).toMatchObject({ artist: "CN artist", cover: "cn.jpg", levelPrecise: 146 });
  });
  it("rejects incomplete provider records without a completion notice", async () => {
    state.incomplete = true;
    await expect(fetchLevels(context("jp"))).rejects.toThrow("Errors occurred during song update");
    expect(sendDiscordNotice).not.toHaveBeenCalledWith("maimai", "jp", "Fetch pipeline completed", expect.any(String), expect.any(Number));
  });
});
