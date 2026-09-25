import { afterEach, describe, expect, it, vi } from "vitest";
import { collectCatalog, ingestCatalog } from "./catalog-ingestion";
import { GAME_REGISTRY } from "@/lib/games/registry";
import type { Logger } from "pino";

vi.mock("./catalog-persistence", () => ({ persistCatalog: vi.fn().mockResolvedValue({ applied: { added: 1 } }) }));
import { persistCatalog } from "./catalog-persistence";
const log = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(), trace: vi.fn(), child: vi.fn() } as unknown as Logger;
const context = { region: "jp" as const, version: 9, cookies: "", log, notice: { addDetail: vi.fn(), details: [] } };
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("catalog adapter orchestration", () => {
  it("rejects unconfigured collection and persistence before source work", async () => {
    const adapter = GAME_REGISTRY.chunithm.adapter;
    const old = adapter.catalog;
    adapter.catalog = { configured: false, collect: vi.fn() };
    try {
      await expect(collectCatalog("chunithm", context)).rejects.toMatchObject({ code: "SOURCE_NOT_CONFIGURED" });
      await expect(ingestCatalog({ game: "chunithm", region: "jp", version: 9, uploadSongs: [], updateMode: "alter", log })).rejects.toMatchObject({ code: "SOURCE_NOT_CONFIGURED" });
      expect(adapter.catalog.collect).not.toHaveBeenCalled();
      expect(persistCatalog).not.toHaveBeenCalled();
    } finally { adapter.catalog = old; }
  });

  it.each(["maimai", "chunithm"] as const)("collects %s through its adapter and uses shared persistence without public activation", async game => {
    const adapter = GAME_REGISTRY[game].adapter;
    const old = adapter.catalog;
    const collect = vi.fn().mockResolvedValue([]);
    adapter.catalog = { configured: true, collect };
    try {
      await expect(collectCatalog(game, context)).resolves.toEqual([]);
      await expect(ingestCatalog({ game, region: "jp", version: 9, uploadSongs: [], updateMode: "noop", log })).resolves.toEqual({ applied: { added: 1 } });
      expect(collect).toHaveBeenCalledWith(context);
      expect(persistCatalog).toHaveBeenCalledWith(game, "jp", 9, [], "noop", log);
      expect(GAME_REGISTRY.chunithm.enabled).toBe(false);
    } finally { adapter.catalog = old; }
  });
});
