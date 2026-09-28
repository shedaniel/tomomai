import { createFillMissingFetcher } from "@/server/services/catalog/ingestion/stages";
import { key } from "./merge";
import type { FetchingContext, PendingSong, SongFetcher } from "./types";
import { levelToPrecise } from "./levels";

export const FillMissingFetcher: SongFetcher = createFillMissingFetcher<PendingSong, FetchingContext>(key, context => ({
  toPrecise: level => levelToPrecise(level, context.version),
  mismatchUpperOffset: minimum => minimum < 70 ? 9 : 5,
}));
