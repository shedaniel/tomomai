import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import { runFetchers, type Fetcher, type FetcherDefinition } from "./runner";
import type { CatalogFetchContext } from "./types";

const context: CatalogFetchContext = { region: "jp", version: 9, log: pino({ enabled: false }), notice: { addDetail: vi.fn(), details: [] } };
type Chart = { id: string; artist?: string };

describe("catalog fetcher runner", () => {
  it("carries cumulative records and source attribution through ordered stages", async () => {
    const source: Fetcher<Chart, CatalogFetchContext> = async (ctx, songs) => {
      expect(songs).toEqual([]);
      expect(ctx.previous).toBeNull();
      ctx.notice.addDetail("Fetched source chart");
      return [{ id: "chart" }];
    };
    const fill: Fetcher<Chart, CatalogFetchContext> = async (ctx, songs) => {
      expect(ctx.previous).toBe(source);
      expect(ctx.current).toBe(fill);
      expect(ctx.fetcherIndex).toBe(1);
      expect(songs).toEqual([expect.objectContaining({ id: "chart" })]);
      return songs.map(song => ({ ...song, artist: "Artist" }));
    };
    const notify = vi.fn<NonNullable<FetcherDefinition<Chart, CatalogFetchContext, Chart>["notify"]>>(async () => {});
    const records = await runFetchers(context, {
      fetchers: [source, fill], names: ["Source", "Fill"], key: song => song.id,
      complete: song => ({ id: song.id, artist: song.artist }), notify,
    });
    expect(records).toEqual([{ id: "chart", artist: "Artist" }]);
    expect(notify.mock.calls[0][1]).toContain("+1 added, ~0 modified");
    expect(notify.mock.calls[0][1]).toContain("Fetched source chart");
    expect(notify.mock.calls[1][1]).toContain("+0 added, ~1 modified");
  });

  it("stops later stages and completion when a source fails", async () => {
    const failure = new Error("source failed");
    const source: Fetcher<Chart, CatalogFetchContext> = vi.fn().mockRejectedValue(failure);
    const fill: Fetcher<Chart, CatalogFetchContext> = vi.fn();
    const complete = vi.fn();
    await expect(runFetchers(context, { fetchers: [source, fill], names: ["Source", "Fill"], key: song => song.id, complete })).rejects.toBe(failure);
    expect(fill).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });
});
