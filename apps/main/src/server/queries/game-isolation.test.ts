import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { statements, results, select } = vi.hoisted(() => ({ statements: [] as unknown[], results: [] as unknown[][], select: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select, delete: select } }));
vi.mock("@/lib/r2", () => ({ deleteFromR2: vi.fn(), isR2IconUrl: () => false, r2KeyFromIconUrl: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

import { fetchUserSnapshots, fetchSnapshotData, deleteUserSnapshot } from "./snapshots";
import { fetchRecentSongs } from "./recents";
import { fetchUserAlbums } from "./albums";
import { fetchPlayerStats } from "./stats";

beforeEach(() => {
  statements.length = 0;
  results.length = 0;
  select.mockImplementation(() => {
    const result = results.shift() ?? [];
    const chain = {
      from: () => chain, innerJoin: () => chain, leftJoin: () => chain,
      where: (condition: unknown) => { statements.push(condition); return chain; },
      orderBy: () => chain, limit: () => chain, offset: () => chain, returning: () => chain,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(result).then(resolve),
    };
    return chain;
  });
});

function filters() {
  return statements.map(statement => new PgDialect().sqlToQuery(statement as Parameters<PgDialect["sqlToQuery"]>[0]));
}

it.each(["maimai", "chunithm"] as const)("isolates %s snapshot reads and deletes with the same user and region", async game => {
  await fetchUserSnapshots(game, "same-user", "jp");
  await fetchSnapshotData(game, "same-user", "same-id", "jp");
  await deleteUserSnapshot(game, "same-user", "same-id", "jp");
  for (const query of filters()) {
    expect(query.params).toContain(game);
    expect(query.params).toContain("same-user");
    expect(query.sql).toContain('"game"');
  }
});

it("keeps another game's raw chart and score codes without maimai decoding", async () => {
  results.push([{ id: 1, titleType: 7 }], [{ difficulty: 4, type: 1, comboStatus: 3, scoreValue: 1009000 }], []);
  const result = await fetchSnapshotData("chunithm", "same-user", "same-id", "jp");
  expect(result?.snapshot.titleType).toBe(7);
  expect(result?.songs[0]).toMatchObject({ difficulty: 4, type: 1, comboStatus: 3, scoreValue: 1009000 });
  expect(filters().every(query => query.params.includes("chunithm"))).toBe(true);
});

it("scopes recent pagination counts and album reads by game", async () => {
  results.push([], [{ totalCount: 0 }], []);
  await fetchRecentSongs("chunithm", "same-user", "jp", 20, 0);
  await fetchUserAlbums("chunithm", "same-user", "jp", 20, 0);
  expect(filters()).toHaveLength(3);
  expect(filters().every(query => query.params.includes("chunithm"))).toBe(true);
});

it("scopes stats snapshot lookup by game before aggregating", async () => {
  await fetchPlayerStats("chunithm", "same-user", "jp");
  expect(filters()[0].params).toContain("chunithm");
});
