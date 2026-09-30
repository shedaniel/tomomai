import { beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));

import { userSnapshots } from "@/lib/db/schema-pg";
import { latestSnapshot } from "./latest-snapshot";

beforeEach(() => proxy.reset());

// Postgres picks the newest row, so only the query can show which one it asks for.
it("reads the chosen columns of the owner's newest snapshot of the game in the region", async () => {
  proxy.respond([{ id: 41, gameVersion: 13 }]);
  await expect(latestSnapshot("chunithm", "owner", "jp", { id: userSnapshots.id, gameVersion: userSnapshots.gameVersion }))
    .resolves.toEqual({ id: 41, gameVersion: 13 });
  const [query] = proxy.queries;
  expect(query.sql).toBe(
    'select "id", "gameVersion" from "user_snapshots" where ("user_snapshots"."game" = $1 and "user_snapshots"."userId" = $2 and "user_snapshots"."region" = $3) order by "user_snapshots"."fetchedAt" desc limit $4',
  );
  expect(query.params).toEqual(["chunithm", "owner", "jp", 1]);
});

it("reads the newest snapshot fetched by a given time, and null when there is none", async () => {
  const asOf = new Date("2026-09-01T04:00:00Z");
  await expect(latestSnapshot("maimai", "owner", "intl", { fetchedAt: userSnapshots.fetchedAt }, { asOf })).resolves.toBeNull();
  const [query] = proxy.queries;
  expect(query.sql).toContain('"user_snapshots"."fetchedAt" <= $4');
  expect(query.params).toEqual(["maimai", "owner", "intl", asOf.toISOString(), 1]);
});
