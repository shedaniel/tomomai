import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
const mocks = vi.hoisted(() => ({
  publish: vi.fn(), revalidate: vi.fn(),
  log: { child: () => mocks.log, info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/logger", () => ({ flushLogger: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({
  requestLogger: () => ({ log: mocks.log, requestId: "import" }),
  runWithLogger: (_log: unknown, run: () => unknown) => run(),
}));
vi.mock("@/server/services/catalog/publication", () => ({ publishSongCatalog: mocks.publish }));
vi.mock("@/server/services/catalog/revalidation", () => ({ revalidateCatalog: mocks.revalidate }));

import { GET } from "./route";
import { CATALOG_WRITE_LOCK_ID } from "@/server/services/catalog/ingestion/lock";
import { INSTANCE_UPDATE_COLUMNS } from "@/server/services/catalog/ingestion/columns";
import { conflictCopiedColumns } from "@/test/pg-proxy";

const importSongs = (query: string) => GET(new NextRequest(`https://example.test/api/admin/import?${query}`, {
  headers: { authorization: "Bearer admin-secret" },
}));
const instance = (region: string, gameVersion: number, overrides: Record<string, unknown> = {}) => ({
  id: "1", parentId: "2", game: "chunithm", region, gameVersion, level: "14+", levelPrecise: 145, addedVersion: 8, metadata: {}, ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  proxy.reset();
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin-secret");
  vi.stubEnv("FRONTEND_GAME", "chunithm");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "cn");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/admin/import", () => {
  it("uses the requested game's supported regions independently of maimai enablement", async () => {
    expect((await importSongs("game=chunithm&from=version%3E%3D0%40jp-8&to=intl-8")).status).toBe(200);
    expect(proxy.queries[0].sql).toBe(`select pg_advisory_xact_lock(${CATALOG_WRITE_LOCK_ID})`);
    expect(proxy.transactions).toEqual(["begin", "commit"]);
    expect(mocks.publish).toHaveBeenCalledWith("chunithm");
    expect(mocks.revalidate).toHaveBeenCalledWith("chunithm", { log: mocks.log });
  });

  it("updates an existing target chart with the source's constant and provenance", async () => {
    // The game's source slice holds an estimated constant, and the target already has that parent's chart.
    const source = instance("jp", 8, { metadata: { levelPreciseEstimated: true } });
    proxy.answer(({ table, params }) => {
      if (table !== "songs" || !params.includes("chunithm")) return undefined;
      if (params.includes("jp") && params.includes(8)) return [source];
      if (params.includes("intl") && params.includes(8)) return [instance("intl", 8, { id: "3", levelPrecise: 140 })];
    });
    const response = await importSongs("game=chunithm&from=version%3E%3D0%40jp-8&to=intl-8&mode=only-upsert");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ statistics: { sourceFound: 1, updated: 1, skipped: 0 } });
    expect(proxy.inserted("songs")).toEqual([expect.objectContaining({
      parentId: BigInt(2), game: "chunithm", region: "intl", gameVersion: 8, levelPrecise: 145, metadata: JSON.stringify(source.metadata),
    })]);
    // Only the statement shows which columns the conflict branch copies onto the existing chart.
    const upsert = proxy.queries.find(query => query.table === "songs" && query.sql.startsWith("insert"))!;
    expect(conflictCopiedColumns(upsert).toSorted()).toEqual([...INSTANCE_UPDATE_COLUMNS].toSorted());
  });
});
