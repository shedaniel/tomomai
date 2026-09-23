import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectCatalog, ingestCatalog } from "./catalog-ingestion";
import { GAME_REGISTRY } from "@/lib/games/registry";
import { createNoticeSink } from "../admin/fetcher-utils";
import type { Logger } from "pino";

const log = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(), trace: vi.fn(), child: vi.fn() } as unknown as Logger;
const context = { region: "jp" as const, version: 14, cookies: "", log, notice: createNoticeSink() };
beforeEach(() => { vi.restoreAllMocks(); });

describe("catalog adapter orchestration", () => {
  it("rejects an unimplemented game before collecting or persisting", async () => {
    const loader = vi.fn();
    const previous = GAME_REGISTRY.chunithm.adapter.catalog.loadImplementation;
    GAME_REGISTRY.chunithm.adapter.catalog.loadImplementation = loader;
    try {
      await expect(collectCatalog("chunithm", context)).rejects.toMatchObject({ code: "GAME_NOT_ENABLED" });
      await expect(ingestCatalog({ game: "chunithm", region: "jp", version: 14, uploadSongs: [], updateMode: "alter", log })).rejects.toMatchObject({ code: "GAME_NOT_ENABLED" });
      expect(loader).not.toHaveBeenCalled();
    } finally { GAME_REGISTRY.chunithm.adapter.catalog.loadImplementation = previous; }
  });

  it("dispatches collection and persistence to the selected adapter", async () => {
    const collect = vi.fn().mockResolvedValue([]);
    const ingest = vi.fn().mockResolvedValue({ applied: { added: 1 } });
    const loader = vi.spyOn(GAME_REGISTRY.maimai.adapter.catalog, "loadImplementation").mockResolvedValue({ collect, ingest });
    await expect(collectCatalog("maimai", context)).resolves.toEqual([]);
    await expect(ingestCatalog({ game: "maimai", region: "jp", version: 14, uploadSongs: [], updateMode: "noop", log })).resolves.toEqual({ applied: { added: 1 } });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(ingest).toHaveBeenCalledWith("maimai", "jp", 14, [], "noop", log);
  });
});
