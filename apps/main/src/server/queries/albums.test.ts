import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ queries: [] as { sql: string; params: unknown[] }[], rows: [] as unknown[][] }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    return { rows: state.rows };
  }) };
});

import { fetchAlbumStorageUsage } from "./albums";

beforeEach(() => {
  state.queries = [];
  state.rows = [];
  vi.stubEnv("NEXT_PUBLIC_ENABLED_REGIONS", undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("sums album storage per region in one query and lists every region that offers albums", async () => {
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp,intl,cn");
  // cn keeps its stored photos in the total although albums are not offered there any more.
  state.rows = [["jp", "300"], ["cn", "50"]];
  await expect(fetchAlbumStorageUsage("maimai", "owner")).resolves.toEqual({
    totalUsed: 350,
    byRegion: [{ region: "intl", used: 0 }, { region: "jp", used: 300 }],
  });
  const [query] = state.queries;
  expect(state.queries).toHaveLength(1);
  expect(query.sql).not.toContain("parent_song");
  expect(query.sql).toContain('group by "songs"."region"');
  expect(query.params).toEqual(["maimai", "owner"]);
});
