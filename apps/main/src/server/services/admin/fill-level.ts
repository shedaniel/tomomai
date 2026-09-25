import type { PendingSong } from "@/server/utils/admin/type";
import { createFillMissingFetcher } from "../games/catalog-stages";
import { key, type FetchingContext, type SongFetcher } from "./fetcher-utils";

export const FillMissingFetcher: SongFetcher = createFillMissingFetcher<PendingSong, FetchingContext>(key, context => ({
  plusOffset: context.version >= 9 ? 6 : 7,
  mismatchUpperOffset: minimum => minimum < 70 ? 9 : 5,
}));
