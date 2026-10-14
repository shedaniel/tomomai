import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { Region } from "@/lib/games/ids";
import { asCatalogFetcher } from "@/server/services/catalog/ingestion/merge";
import { important, type CatalogFetchContext, type SourceChart } from "@/server/services/catalog/ingestion/types";
import { maimaiChart } from "./chart";

const titles = vi.hoisted(() => ["Z", "A"]);
type Fields = Omit<Parameters<typeof maimaiChart>[0], "songName" | "type" | "difficulty">;
function fixtureStep(fields: Fields) {
  return (context: CatalogFetchContext, charts: SourceChart[]) => asCatalogFetcher(async () => titles.map(songName => maimaiChart({
    songName, type: "dx", difficulty: "master", level: "14+", ...fields,
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

const collect = (region: Region) => collectCatalog("maimai", { region, version: 9, session: { cookies: "" }, log: pino({ enabled: false }) });

describe("maimai catalog recipe", () => {
  it.each(["jp", "intl"] as const)("preserves %s source precedence, enrichment and final filling", async region => {
    const result = await collect(region);
    expect(result.map(song => song.songName)).toEqual(["A", "Z"]);
    expect(result[0]).toMatchObject({ game: "maimai", chartType: 1, difficulty: 3, artist: "Official artist", addedVersion: 8, bpm: 180,
      noteDesigner: "Corrected designer", noteCounts: { tap: 100, touch: 3 },
      levelPrecise: 146, metadata: { levelPreciseEstimated: true } });
  });
  it("uses the CN provider and the shared fill stage", async () => {
    expect((await collect("cn"))[0]).toMatchObject({ artist: "CN artist", cover: "cn.jpg", levelPrecise: 146 });
  });
});
