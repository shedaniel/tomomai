import type { CatalogFetchContext, Pending } from "@/server/services/catalog/ingestion/types";
import { fillMissingCatalogLevel, type CatalogLevelPolicy } from "@/server/services/catalog/ingestion/levels";
import { requireCatalogValue, type Fetcher } from "@/server/services/catalog/ingestion/runner";
import { value } from "./types";

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
    const levelPolicy = policy(context);
    const result = songs.map(song => {
      const songKey = key(song);
      const level = requireCatalogValue(value(song.level), "level", songKey, context.log);
      const filled = fillMissingCatalogLevel(level, value(song.levelPrecise), levelPolicy);
      if (filled.reason === "missing") {
        missing++;
        context.log.warn({ songKey }, "Level precise is missing");
      }
      if (filled.reason === "mismatched") {
        mismatched++;
        context.log.warn({ songKey }, "Level precise is mismatched");
      }
      const metadata = value(song.metadata);
      return {
        ...song,
        levelPrecise: filled.reason ? filled.levelPrecise : song.levelPrecise,
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
