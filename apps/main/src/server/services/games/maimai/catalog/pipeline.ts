import "server-only";
import type { Region } from "@/lib/types";
import type { CatalogStage } from "@/server/services/catalog/ingestion/runner";
import { DxDataFetcher } from "./sources/dxrating";
import { FallbackFetcher } from "./sources/fallback";
import { MaimaiAfterFetcher } from "./sources/after-fetch";
import { MaimaiBaseFetcher } from "./sources/base-songs";
import { MaimaiScraperFetcher } from "./sources/scraper";
import { OtogeDbFetcher } from "./sources/otoge-db";
import { LxnsFetcher } from "./sources/lxns";

const SEGA_STAGES: CatalogStage[] = [
  // Every chart, its level and version, from maimai NET's version search
  { name: "Maimai Scraper", run: MaimaiScraperFetcher },
  // Cover, genre and artist from the official songs JSON
  { name: "Maimai Base Songs", run: MaimaiBaseFetcher },
  // Constants, BPM, chart designers and note counts
  { name: "DxData", run: DxDataFetcher },
  // Hand-kept charts from data/extra
  { name: "Fallback", run: FallbackFetcher },
  { name: "OtogeDB", run: OtogeDbFetcher },
  // maimai NET chart details for anything still missing a cover, genre or artist
  { name: "Maimai After Fetch", run: MaimaiAfterFetcher },
];

const CN_STAGES: CatalogStage[] = [
  { name: "Lxns", run: LxnsFetcher },
];

export function maimaiCatalogStages(region: Region): CatalogStage[] {
  return region === "cn" ? CN_STAGES : SEGA_STAGES;
}
