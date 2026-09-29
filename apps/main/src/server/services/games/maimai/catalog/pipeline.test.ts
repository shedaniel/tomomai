import { beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { Logger } from "pino";
import type { Region } from "@/lib/types";
import { asCatalogFetcher } from "@/server/services/catalog/ingestion/merge";
import { important, type CatalogFetchContext, type SourceChart } from "@/server/services/catalog/ingestion/types";
import { maimaiChart } from "./chart";

const state = vi.hoisted(() => ({ incomplete: false, titles: ["Z", "A"] }));
type Fields = Omit<Parameters<typeof maimaiChart>[0], "songName" | "type" | "difficulty">;
function fixtureStep(fields: Fields) {
  return (context: CatalogFetchContext, charts: SourceChart[]) => asCatalogFetcher(async () => state.titles.map(songName => maimaiChart({
    songName, type: "dx", difficulty: "master", level: "14+", ...fields,
    ...(state.incomplete ? { cover: undefined } : {}),
  })))(context, charts);
}
vi.mock("./sources/scraper", () => ({ MaimaiScraperFetcher: fixtureStep({ addedVersion: important(8) }) }));
vi.mock("./sources/base-songs", () => ({ MaimaiBaseFetcher: fixtureStep({ artist: important("Official artist"), genre: important("maimai"), cover: "official.jpg" }) }));
vi.mock("./sources/dxrating", () => ({ DxDataFetcher: fixtureStep({ bpm: 180, noteDesigner: "Early designer" }) }));
vi.mock("./sources/fallback", () => ({ FallbackFetcher: fixtureStep({ noteDesigner: "Corrected designer" }) }));
vi.mock("./sources/otoge-db", () => ({ OtogeDbFetcher: fixtureStep({ artist: "Fallback artist", addedVersion: 7 }) }));
vi.mock("./sources/after-fetch", () => ({ MaimaiAfterFetcher: fixtureStep({ noteCounts: { tap: 100, hold: 1, slide: 2, touch: 3, break: 4 } }) }));
vi.mock("./sources/lxns", () => ({ LxnsFetcher: fixtureStep({ artist: "CN artist", genre: "maimai", cover: "cn.jpg", addedVersion: 8 }) }));
vi.mock("@/server/services/discord/webhook", () => ({ sendDiscordNotice: vi.fn(async () => {}) }));
import { collectCatalog } from "@/server/services/catalog/ingestion/collect";
import { sendDiscordNotice } from "@/server/services/discord/webhook";

beforeEach(() => { state.incomplete = false; state.titles = ["Z", "A"]; vi.clearAllMocks(); });
const collect = (region: Region, log: Logger = pino({ enabled: false })) => collectCatalog("maimai", { region, version: 9, session: { cookies: "" }, log });

describe("maimai catalog recipe", () => {
  it.each(["jp", "intl"] as const)("preserves %s source precedence, enrichment and final filling", async region => {
    const result = await collect(region);
    expect(result.map(song => song.songName)).toEqual(["A", "Z"]);
    expect(result[0]).toMatchObject({ game: "maimai", chartType: 1, difficulty: 3, artist: "Official artist", addedVersion: 8, bpm: 180,
      noteDesigner: "Corrected designer", noteCounts: { tap: 100, touch: 3 },
      levelPrecise: 146, metadata: { levelPreciseEstimated: true } });
    expect(vi.mocked(sendDiscordNotice).mock.calls.map(call => call[2])).toEqual([
      "Stage 1/7: Maimai Scraper", "Stage 2/7: Maimai Base Songs", "Stage 3/7: DxData", "Stage 4/7: Fallback",
      "Stage 5/7: OtogeDB", "Stage 6/7: Maimai After Fetch", "Stage 7/7: Fill Missing", "Fetch pipeline completed",
    ]);
  });
  it("uses the CN provider and the shared fill stage", async () => {
    expect((await collect("cn"))[0]).toMatchObject({ artist: "CN artist", cover: "cn.jpg", levelPrecise: 146 });
  });
  it("reports titles that are not in their normalized form", async () => {
    state.titles = ["Ｌｉｎｋ"];
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => log };
    await collect("cn", log as unknown as Logger);
    expect(log.error).toHaveBeenCalledWith({ songKey: JSON.stringify(["maimai", "Ｌｉｎｋ", 1, 3]) }, "Song name does not match normalized name");
  });
  it("rejects incomplete provider records without a completion notice", async () => {
    state.incomplete = true;
    await expect(collect("jp")).rejects.toThrow("Errors occurred during song update");
    expect(sendDiscordNotice).not.toHaveBeenCalledWith("maimai", "jp", "Fetch pipeline completed", expect.any(String), expect.any(Number));
  });
});
