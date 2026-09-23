import { expect, it, vi } from "vitest";

const { cacheCalls, queryCatalogCharts } = vi.hoisted(() => ({ cacheCalls: [] as { keys: string[]; tags: string[] }[], queryCatalogCharts: vi.fn(async () => []) }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown, keys: string[], options: { tags: string[] }) => {
  cacheCalls.push({ keys, tags: options.tags });
  return fn;
} }));
vi.mock("./songs", () => ({ queryCatalogCharts, queryAllUniqueSongs: vi.fn(), querySongDetails: vi.fn() }));
import { getCatalogChartsCached } from "./songs-cache";

it("separates cache identity and invalidation tags for identical regional versions in two games", async () => {
  await getCatalogChartsCached("maimai", "jp", 9);
  await getCatalogChartsCached("chunithm", "jp", 9);
  expect(cacheCalls).toEqual([
    { keys: ["catalog-charts", "maimai", "jp", "9"], tags: ["all-unique-songs:maimai"] },
    { keys: ["catalog-charts", "chunithm", "jp", "9"], tags: ["all-unique-songs:chunithm"] },
  ]);
  expect(queryCatalogCharts.mock.calls).toEqual([["maimai", "jp", 9], ["chunithm", "jp", 9]]);
});
