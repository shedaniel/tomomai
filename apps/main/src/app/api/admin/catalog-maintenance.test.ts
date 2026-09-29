import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  upsert: vi.fn(), publish: vi.fn(), where: vi.fn(), execute: vi.fn(),
  log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: { transaction: async (run: (tx: unknown) => unknown) => run({
  execute: mocks.execute,
  selectDistinct: () => ({ from: () => ({ where: () => [] }) }),
  select: () => ({ from: () => ({ where: (condition: unknown) => { mocks.where(condition); return mocks.rows; } }) }),
  insert: () => ({ values: () => ({ onConflictDoUpdate: mocks.upsert }) }),
}) } }));
vi.mock("@/lib/logger", () => ({ flushLogger: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({ requestLogger: () => ({ log: mocks.log, requestId: "maintenance" }) }));
vi.mock("@/server/services/catalog/publication", () => ({ publishSongCatalog: mocks.publish }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

import { GET as normalize } from "./db/route";
import { GET as importSongs } from "./import/route";
import { CATALOG_WRITE_LOCK_ID } from "@/server/services/catalog/ingestion/lock";

const request = (path: string) => new NextRequest(`https://example.test/api/admin/${path}`, {
  headers: { authorization: "Bearer admin-secret" },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [];
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin-secret");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "cn");
});
afterEach(() => vi.unstubAllEnvs());

describe("catalog maintenance", () => {
  it.each([
    [normalize, "db?game=chunithm&region=jp&version=8"],
    [importSongs, "import?game=chunithm&from=version%3E%3D0%40jp-8&to=intl-8"],
  ] as const)("uses the requested game's supported regions independently of maimai enablement", async (handler, path) => {
    expect((await handler(request(path))).status).toBe(200);
    expect(mocks.publish).toHaveBeenCalledWith("chunithm");
    expect(new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]).sql).toBe(`select pg_advisory_xact_lock(${CATALOG_WRITE_LOCK_ID})`);
  });

  it("updates provenance with the copied constant when a target chart already exists", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp,intl");
    mocks.rows = [{ id: BigInt(1), parentId: BigInt(2), game: "chunithm", region: "jp", gameVersion: 8,
      levelPrecise: 145, addedVersion: 8, metadata: { levelPreciseEstimated: true } }];
    const response = await importSongs(request("import?game=chunithm&from=version%3E%3D0%40jp-8&to=intl-8&mode=only-upsert"));
    expect(response.status).toBe(200);
    const update = mocks.upsert.mock.calls[0][0].set;
    expect(update).toHaveProperty("metadata");
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(update.metadata).sql).toBe("excluded.metadata");
    const sourceFilter = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(sourceFilter.sql).toContain('"songs"."game" =');
    expect(sourceFilter.params).toContain("chunithm");
  });
});
