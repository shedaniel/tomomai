import { afterEach, describe, expect, it, vi } from "vitest";
import { collectCatalog, ingestCatalog } from "@/server/services/catalog/ingestion/index";
import { runFetchers, type Fetcher } from "@/server/services/catalog/ingestion/runner";
import { GAME_REGISTRY } from "@/lib/games/registry";
import type { CatalogFetchContext, PendingChart } from "@/server/services/catalog/ingestion/types";
import pino from "pino";
import { completeCatalogChart } from "./normalize-charts";

vi.mock("@/server/services/catalog/ingestion/persistence", () => ({ persistCatalog: vi.fn().mockResolvedValue({ applied: { added: 1 } }) }));
import { persistCatalog } from "@/server/services/catalog/ingestion/persistence";
const log = pino({ enabled: false });
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

  it.each(["maimai", "chunithm"] as const)("runs %s steps with cumulative state and attribution before shared persistence", async game => {
    const adapter = GAME_REGISTRY[game].adapter;
    const old = adapter.catalog;
    const events: string[] = [];
    const source = vi.fn<Fetcher<PendingChart, CatalogFetchContext>>(async (ctx, songs) => {
      events.push("source");
      expect(ctx.previous).toBeNull();
      expect(ctx.current).toBe(source);
      expect(ctx.fetcherIndex).toBe(0);
      expect(songs).toEqual([]);
      ctx.notice.addDetail("source detail");
      return [{ game, songName: "Example", chartType: 0, difficulty: 3, level: "14", artist: "Artist", cover: "cover.png", genre: "Original" }];
    });
    const fill = vi.fn<Fetcher<PendingChart, CatalogFetchContext>>(async (ctx, songs) => {
      events.push("fill");
      expect(ctx.previous).toBe(source);
      expect(ctx.current).toBe(fill);
      expect(ctx.fetcherIndex).toBe(1);
      expect(songs).toEqual([expect.objectContaining({ songName: "Example", level: "14" })]);
      return songs.map(song => ({ ...song, levelPrecise: 140, addedVersion: 9 }));
    });
    const notify = vi.fn().mockResolvedValue(undefined);
    const validate = vi.fn();
    adapter.catalog = {
      configured: true,
      collect: ctx => runFetchers(ctx, {
        fetchers: [source, fill], names: [game, "Fill Missing"],
        key: song => `${song.game}:${song.songName}:${song.difficulty}`, validate,
        complete: song => completeCatalogChart(song, log),
        notify,
      }),
    };
    try {
      const records = await collectCatalog(game, context);
      expect(events).toEqual(["source", "fill"]);
      expect(records).toEqual([{ game, songName: "Example", chartType: 0, difficulty: 3, level: "14", levelPrecise: 140, addedVersion: 9, artist: "Artist", cover: "cover.png", genre: "Original" }]);
      expect(validate).toHaveBeenCalledTimes(2);
      expect(notify).toHaveBeenCalledWith(expect.stringContaining(game), expect.stringContaining("source detail"), expect.any(Number));
      await expect(ingestCatalog({ game, region: "jp", version: 9, uploadSongs: records, updateMode: "noop", log })).resolves.toEqual({ applied: { added: 1 } });
      expect(persistCatalog).toHaveBeenCalledWith(game, "jp", 9, records, "noop", log);
      expect(GAME_REGISTRY.chunithm.enabled).toBe(false);
    } finally { adapter.catalog = old; }
  });

  it.each(["maimai", "chunithm"] as const)("stops the %s recipe at its failing source step", async game => {
    const adapter = GAME_REGISTRY[game].adapter;
    const old = adapter.catalog;
    const failure = new Error("source failed");
    const source: Fetcher<PendingChart, CatalogFetchContext> = vi.fn().mockRejectedValue(failure);
    const fill: Fetcher<PendingChart, CatalogFetchContext> = vi.fn();
    const complete = vi.fn();
    adapter.catalog = { configured: true, collect: ctx => runFetchers(ctx, {
      fetchers: [source, fill], names: [game, "Fill Missing"], key: song => song.songName,
      validate: vi.fn(), complete,
    }) };
    try {
      await expect(collectCatalog(game, context)).rejects.toBe(failure);
      expect(fill).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
      expect(persistCatalog).not.toHaveBeenCalled();
    } finally { adapter.catalog = old; }
  });
});
