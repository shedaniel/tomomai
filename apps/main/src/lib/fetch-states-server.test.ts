import { expect, it, vi } from "vitest";

const queries = vi.hoisted(() => [] as { sql: string; params: unknown[] }[]);
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    queries.push({ sql, params });
    return { rows: sql.startsWith("select") ? [["login"]] : [] };
  }) };
});
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ debug: vi.fn(), error: vi.fn(), warn: vi.fn() }) }));

import { appendFetchState } from "./fetch-states-server";
import { FETCH_STATES } from "./fetch-states";

it("appends progress only to the pending session of the requested game", async () => {
  await appendFetchState(BigInt(17), FETCH_STATES.PLAYER_DATA, "chunithm");
  expect(queries).toHaveLength(2);
  for (const query of queries) {
    expect(query.sql).toContain('"fetch_sessions"."game" =');
    expect(query.params).toEqual(expect.arrayContaining(["chunithm", "pending"]));
    expect(query.params).not.toContain("maimai");
  }
  expect(queries[1].params).toContain("login,player_data");
});
