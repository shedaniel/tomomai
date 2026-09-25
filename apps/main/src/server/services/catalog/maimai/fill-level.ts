import type { PendingSong } from "@/server/services/catalog/maimai/types";
import { createFillMissingFetcher } from "../ingestion/stages";
import { key } from "./merge";
import type { FetchingContext, SongFetcher } from "./types";

export const FillMissingFetcher: SongFetcher = createFillMissingFetcher<PendingSong, FetchingContext>(key, context => ({
  plusOffset: context.version >= 9 ? 6 : 7,
  mismatchUpperOffset: minimum => minimum < 70 ? 9 : 5,
}));
