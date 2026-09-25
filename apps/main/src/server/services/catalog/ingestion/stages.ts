import type { CatalogFetchContext, Pending } from "@/server/services/catalog/ingestion/types";
import { fillMissingCatalogLevel, type CatalogLevelPolicy } from "@/server/services/catalog/ingestion/levels";
import type { Fetcher } from "@/server/services/catalog/ingestion/runner";
import { pendingValue } from "./types";

type LevelChart = {
  level?: Pending<string>;
  levelPrecise?: Pending<number>;
  metadata?: Pending<Record<string, unknown>>;
};

export function createFillMissingFetcher<T extends LevelChart, C extends CatalogFetchContext>(
  key: (chart: T) => string,
  policy: (context: C) => CatalogLevelPolicy,
): Fetcher<T, C> {
  return async (context, songs) => {
    let missing = 0, mismatched = 0;
    const result = songs.map(song => {
      const songKey = key(song);
      const filled = fillMissingCatalogLevel(pendingValue(song.level), pendingValue(song.levelPrecise), policy(context));
      if (filled.reason === "missing") {
        missing++;
        context.log.warn({ songKey }, "Level precise is missing");
      }
      if (filled.reason === "mismatched") {
        mismatched++;
        context.log.warn({ songKey }, "Level precise is mismatched");
      }
      const metadata = pendingValue(song.metadata);
      return {
        ...song,
        levelPrecise: filled.reason ? filled.levelPrecise ?? undefined : song.levelPrecise,
        metadata: { ...metadata, levelPreciseEstimated: filled.estimated || metadata?.levelPreciseEstimated === true },
      };
    });
    context.notice.addDetail(`${missing} missing, ${mismatched} mismatched level precise values fixed`);
    return result;
  };
}

export function createSorterFetcher<T, C extends CatalogFetchContext>(compare: (a: T, b: T) => number): Fetcher<T, C> {
  return async (context, songs) => {
    context.log.debug("Sorting songs...");
    return songs.sort(compare);
  };
}
