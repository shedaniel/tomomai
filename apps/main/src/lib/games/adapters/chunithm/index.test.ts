import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import { resolveGame } from "../../registry";

const pipeline = vi.hoisted(() => ({ loaded: vi.fn(), collect: vi.fn().mockResolvedValue([]) }));
vi.mock("@/server/services/catalog/chunithm/pipeline", () => {
  pipeline.loaded();
  return { chunithmCatalogAdapter: { collect: pipeline.collect } };
});

describe("CHUNITHM catalog loading", () => {
  it("keeps game metadata independent of ingestion until collection", async () => {
    const { adapter } = resolveGame("chunithm");
    expect(adapter.catalog.configured).toBe(true);
    expect(adapter.catalog.resolveVersion!("jp")).toBeTypeOf("number");
    expect(pipeline.loaded).not.toHaveBeenCalled();

    const context = {
      region: "jp" as const,
      version: adapter.catalog.resolveVersion!("jp"),
      log: pino({ enabled: false }),
      notice: { details: [], addDetail: vi.fn() },
    };
    await expect(adapter.catalog.collect!(context)).resolves.toEqual([]);
    expect(pipeline.loaded).toHaveBeenCalledOnce();
    expect(pipeline.collect).toHaveBeenCalledWith(context);
  });
});
