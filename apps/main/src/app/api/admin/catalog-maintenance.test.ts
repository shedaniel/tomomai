import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  instances: [] as Record<string, unknown>[],
  renames: [] as Record<string, unknown>[],
  upsert: vi.fn(), publish: vi.fn(), revalidate: vi.fn(), where: vi.fn(), execute: vi.fn(),
  log: { child: () => mocks.log, info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: { transaction: async (run: (tx: unknown) => unknown) => run({
  execute: mocks.execute,
  selectDistinct: () => ({ from: () => ({ where: () => mocks.instances }) }),
  // A projected select is the normalize route's title collision lookup.
  select: (projection?: unknown) => ({ from: () => ({ where: (condition: unknown) => {
    mocks.where(condition);
    const rows = projection ? [] : mocks.rows;
    return Object.assign([...rows], { orderBy: () => rows });
  } }) }),
  insert: () => ({ values: () => ({ onConflictDoUpdate: mocks.upsert }) }),
  update: () => ({ set: (values: Record<string, unknown>) => ({ where: () => mocks.renames.push(values) }) }),
}) } }));
vi.mock("@/lib/logger", () => ({ flushLogger: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({
  requestLogger: () => ({ log: mocks.log, requestId: "maintenance" }),
  runWithLogger: (_log: unknown, run: () => unknown) => run(),
}));
vi.mock("@/server/services/catalog/publication", () => ({ publishSongCatalog: mocks.publish }));
vi.mock("@/server/services/catalog/revalidation", () => ({ revalidateCatalog: mocks.revalidate }));

import { GET as normalize } from "./db/route";
import { GET as importSongs } from "./import/route";
import { CATALOG_WRITE_LOCK_ID } from "@/server/services/catalog/ingestion/lock";
import { INSTANCE_UPDATE_COLUMNS } from "@/server/services/catalog/ingestion/columns";

const request = (path: string) => new NextRequest(`https://example.test/api/admin/${path}`, {
  headers: { authorization: "Bearer admin-secret" },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [];
  mocks.instances = [];
  mocks.renames = [];
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin-secret");
  vi.stubEnv("FRONTEND_GAME", "chunithm");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "cn");
});
afterEach(() => vi.unstubAllEnvs());

describe("catalog maintenance", () => {
  it("uses the requested game's supported regions independently of maimai enablement", async () => {
    expect((await importSongs(request("import?game=chunithm&from=version%3E%3D0%40jp-8&to=intl-8"))).status).toBe(200);
    expect(mocks.publish).toHaveBeenCalledWith("chunithm");
    expect(mocks.revalidate).toHaveBeenCalledWith("chunithm", { log: mocks.log });
    expect(new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]).sql).toBe(`select pg_advisory_xact_lock(${CATALOG_WRITE_LOCK_ID})`);
  });

  it("renames maimai parents with the maimai title rule under the catalog lock", async () => {
    vi.stubEnv("FRONTEND_GAME", "maimai");
    mocks.instances = [{ parentId: BigInt(1) }];
    mocks.rows = [{ id: BigInt(1), songName: "Ｌｉｎｋ", type: 0, difficulty: 3, disambiguator: 0 }];
    const response = await normalize(request("db?game=maimai&region=jp"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ statistics: { totalMasterNamesNormalized: 1 } });
    expect(mocks.renames).toEqual([{ songName: "Link", disambiguator: 0 }]);
    expect(mocks.publish).toHaveBeenCalledWith("maimai");
    expect(new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]).sql).toBe(`select pg_advisory_xact_lock(${CATALOG_WRITE_LOCK_ID})`);
  });

  it("refuses to normalize CHUNITHM titles, which ingestion keeps as the source spells them", async () => {
    const response = await normalize(request("db?game=chunithm&region=jp&version=8"));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("updates provenance with the copied constant when a target chart already exists", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp,intl");
    mocks.rows = [{ id: BigInt(1), parentId: BigInt(2), game: "chunithm", region: "jp", gameVersion: 8,
      levelPrecise: 145, addedVersion: 8, metadata: { levelPreciseEstimated: true } }];
    const response = await importSongs(request("import?game=chunithm&from=version%3E%3D0%40jp-8&to=intl-8&mode=only-upsert"));
    expect(response.status).toBe(200);
    const update = mocks.upsert.mock.calls[0][0].set;
    expect(Object.keys(update)).toEqual([...INSTANCE_UPDATE_COLUMNS]);
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(update.metadata).sql).toBe('excluded."metadata"');
    const sourceFilter = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(sourceFilter.sql).toContain('"songs"."game" =');
    expect(sourceFilter.params).toContain("chunithm");
  });
});
