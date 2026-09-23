import { expect, it, vi } from "vitest";

const { cacheCalls, queryCatalogChartsForGame } = vi.hoisted(() => ({ cacheCalls: [] as { keys: string[]; tags: string[] }[], queryCatalogChartsForGame: vi.fn(async () => []) }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown, keys: string[], options: { tags: string[] }) => {
  cacheCalls.push({ keys, tags: options.tags });
  return fn;
} }));
vi.mock("./songs", () => ({ queryCatalogChartsForGame, queryAllUniqueSongs: vi.fn(), querySongDetails: vi.fn() }));
import { getCatalogChartsCachedForGame } from "./songs-cache";

it("separates cache identity and invalidation tags for identical regional versions in two games", async () => {
  await getCatalogChartsCachedForGame("maimai", "jp", 9);
  await getCatalogChartsCachedForGame("chunithm", "jp", 9);
  expect(cacheCalls).toEqual([
    { keys: ["catalog-charts", "maimai", "jp", "9"], tags: ["all-unique-songs:maimai"] },
    { keys: ["catalog-charts", "chunithm", "jp", "9"], tags: ["all-unique-songs:chunithm"] },
  ]);
  expect(queryCatalogChartsForGame.mock.calls).toEqual([["maimai", "jp", 9], ["chunithm", "jp", 9]]);
});
