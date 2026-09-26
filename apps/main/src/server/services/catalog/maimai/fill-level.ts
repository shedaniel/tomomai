import type { PendingSong } from "@/server/services/catalog/maimai/types";
import { createFillMissingFetcher } from "../ingestion/stages";
import { key } from "./merge";
import type { FetchingContext, SongFetcher } from "./types";
import { levelToPrecise } from "@/server/services/catalog/maimai/levels";

export const FillMissingFetcher: SongFetcher = createFillMissingFetcher<PendingSong, FetchingContext>(key, context => ({
  toPrecise: level => levelToPrecise(level, context.version),
  mismatchUpperOffset: minimum => minimum < 70 ? 9 : 5,
}));
