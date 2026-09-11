import { beforeEach, describe, expect, it, vi } from "vitest";
import { gunzipSync } from "node:zlib";
const mocks = vi.hoisted(() => ({
  execute: vi.fn(), from: vi.fn(), insert: vi.fn(), artifact: vi.fn(), manifest: vi.fn(), publicCatalog: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn({
  execute: mocks.execute, select: () => ({ from: mocks.from }), insert: () => ({ values: mocks.insert }),
}) } }));
vi.mock("@tomomai/server/r2", () => ({ uploadCatalogArtifact: mocks.artifact, uploadCatalogManifest: mocks.manifest }));
vi.mock("@/server/services/admin/song-catalog", () => ({ publishPublicCatalog: mocks.publicCatalog }));
import { publishCatalog } from "./publish";
describe("catalog publication", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ sequence: "7" }]);
    mocks.from.mockResolvedValue([]);
    mocks.publicCatalog.mockResolvedValue({ songCount: 0, bytes: 0 });
  });
  it("uploads a validated compressed artifact and publishes the pointer last", async () => {
    const release = await publishCatalog();
    expect(release.sequence).toBe(7);
    const artifact = JSON.parse(gunzipSync(mocks.artifact.mock.calls[0][1]).toString());
    expect(artifact).toMatchObject({ sequence: 7, parents: [], songs: [] });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.manifest.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.publicCatalog.mock.invocationCallOrder[0]);
    expect(mocks.manifest.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.insert.mock.invocationCallOrder[0]);
  });
  it("does not advance the manifest when public catalog publication fails", async () => {
    mocks.publicCatalog.mockRejectedValue(new Error("storage unavailable"));
    await expect(publishCatalog()).rejects.toThrow("storage unavailable");
    expect(mocks.manifest).not.toHaveBeenCalled();
  });
  it("validates before writing objects", async () => {
    mocks.from.mockResolvedValueOnce([{ id: 1n, publicId: "invalid" }]);
    await expect(publishCatalog()).rejects.toThrow();
    expect(mocks.artifact).not.toHaveBeenCalled();
    expect(mocks.manifest).not.toHaveBeenCalled();
  });
});
