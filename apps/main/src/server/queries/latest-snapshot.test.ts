import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ queries: [] as { sql: string; params: unknown[] }[], rows: [] as unknown[][] }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    return { rows: state.rows };
  }) };
});

import { userSnapshots } from "@/lib/db/schema-pg";
import { latestSnapshot } from "./latest-snapshot";

beforeEach(() => { state.queries = []; state.rows = []; });

it("reads the chosen columns of the owner's newest snapshot of the game in the region", async () => {
  state.rows = [[41, 13]];
  await expect(latestSnapshot("chunithm", "owner", "jp", { id: userSnapshots.id, gameVersion: userSnapshots.gameVersion }))
    .resolves.toEqual({ id: 41, gameVersion: 13 });
  const [query] = state.queries;
  expect(query.sql).toBe(
    'select "id", "gameVersion" from "user_snapshots" where ("user_snapshots"."game" = $1 and "user_snapshots"."userId" = $2 and "user_snapshots"."region" = $3) order by "user_snapshots"."fetchedAt" desc limit $4',
  );
  expect(query.params).toEqual(["chunithm", "owner", "jp", 1]);
});

it("reads the newest snapshot fetched by a given time, and null when there is none", async () => {
  const asOf = new Date("2026-09-01T04:00:00Z");
  await expect(latestSnapshot("maimai", "owner", "intl", { fetchedAt: userSnapshots.fetchedAt }, { asOf })).resolves.toBeNull();
  const [query] = state.queries;
  expect(query.sql).toContain('"user_snapshots"."fetchedAt" <= $4');
  expect(query.params).toEqual(["maimai", "owner", "intl", asOf.toISOString(), 1]);
});
