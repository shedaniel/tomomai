import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DrizzleQueryError } from "drizzle-orm";

const mocks = vi.hoisted(() => {
  const log = { child: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  log.child.mockReturnValue(log);
  return { log, persist: vi.fn(), publish: vi.fn(), revalidate: vi.fn(), notice: vi.fn() };
});
vi.mock("@/server/services/catalog/ingestion/persistence", () => ({ persistCatalog: mocks.persist }));
vi.mock("@/server/services/catalog/publication", () => ({ publishSongCatalog: mocks.publish }));
vi.mock("@/server/services/catalog/revalidation", () => ({ revalidateCatalog: mocks.revalidate }));
vi.mock("@/server/services/catalog/notifications", () => ({ sendDiscordWebhook: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/server/services/discord/webhook", () => ({ sendDiscordNotice: mocks.notice }));
vi.mock("@/lib/logger", () => ({ flushLogger: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({
  requestLogger: () => ({ log: mocks.log, requestId: "upload-test" }),
  runWithLogger: (_log: unknown, run: () => unknown) => run(),
}));

import { POST } from "./route";

const chart = { game: "chunithm", songName: "Example", artist: "Artist", chartType: 0, difficulty: 4, level: "14+", levelPrecise: 145, addedVersion: 9, cover: "https://example.test/cover.jpg", genre: "Original" };
const persisted = {
  statistics: { inputSongs: 1, dbSongs: 0, mergedSongs: 1, added: 1, modified: 0, deleted: 0, unchanged: 0 },
  changes: { added: [], modified: [], deleted: [], unchanged: [] },
  applied: { added: 1, modified: 0, deleted: 0, newParents: 1, parentUpdates: 0 },
  appliedDeletions: [], skippedDeletions: [], affected: [],
};
const upload = (query: string, body: string = JSON.stringify({ songs: [chart] })) => POST(new NextRequest(
  `https://example.test/api/admin/upload?game=chunithm&${query}`,
  { method: "POST", headers: { authorization: "Bearer admin-secret", "content-type": "application/json" }, body },
));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.log.child.mockReturnValue(mocks.log);
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin-secret");
  vi.stubEnv("FRONTEND_GAME", "chunithm");
  mocks.persist.mockResolvedValue(persisted);
  mocks.publish.mockResolvedValue({ songCount: 1, bytes: 1 });
  mocks.notice.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/admin/upload", () => {
  it("applies the parsed charts in the requested mode", async () => {
    const response = await upload("region=jp&version=9&update=destructive");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true, requestId: "upload-test", updateMode: "destructive",
      applied: persisted.applied, statistics: persisted.statistics, changes: persisted.changes,
    });
    expect(mocks.persist).toHaveBeenCalledWith("chunithm", "jp", 9, [chart], "destructive", mocks.log);
  });

  it.each([
    ["a missing version", "region=jp", undefined],
    ["an unknown version", "region=jp&version=999", undefined],
    ["a body that is not JSON", "region=jp&version=9", "not json"],
    ["a body without songs", "region=jp&version=9", JSON.stringify({})],
    ["an invalid chart", "region=jp&version=9", JSON.stringify({ songs: [{ ...chart, addedVersion: null }] })],
  ])("rejects %s before persistence or publication", async (_name, query, body) => {
    const response = await upload(query, body);
    expect(response.status).toBe(400);
    expect((await response.json()).requestId).toBe("upload-test");
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("reports a database failure without its SQL in the response and the notice", async () => {
    const cause = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    const error = new DrizzleQueryError(`insert into parent_song ${"secret-sql ".repeat(1000)}`, ["secret-parameter"], cause);
    mocks.persist.mockRejectedValueOnce(error);
    const response = await upload("region=jp&version=9&update=alter");
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "[23505] duplicate key value violates unique constraint", requestId: "upload-test" });
    const description = mocks.notice.mock.calls[0][3];
    expect(description).toContain(body.error);
    expect(description).toContain("upload-test");
    expect(description).not.toContain("secret-");
    expect(mocks.log.error).toHaveBeenCalledWith({ err: error }, "Admin request failed");
  });
});
