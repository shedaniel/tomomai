import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import { fillMissingCatalogLevel, fillMissingStage, parseDisplayLevel } from "./levels";
import { important, type CatalogFetchContext, type SourceChart } from "./types";

vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ warn: vi.fn() }) }));

describe("parseDisplayLevel", () => {
  it("preserves whitespace, parseInt and invalid-level fallback behavior", () => {
    expect(parseDisplayLevel(" 14+ ", 5)).toBe(145);
    expect(parseDisplayLevel("14.5", 6)).toBe(140);
    expect(parseDisplayLevel("?", 6)).toBe(10);
    expect(parseDisplayLevel("?+", 6)).toBe(10);
  });
});

describe("fillMissingCatalogLevel", () => {
  it("fills missing values and preserves confirmed values when the policy has no mismatch repair", () => {
    const policy = { toPrecise: () => 140 };
    expect(fillMissingCatalogLevel("14", undefined, policy)).toEqual({ levelPrecise: 140, estimated: true, reason: "missing" });
    expect(fillMissingCatalogLevel("14", 149, policy)).toEqual({ levelPrecise: 149, estimated: false });
  });

  it("repairs a constant outside the policy's range for the display level", () => {
    const policy = { toPrecise: () => 140, mismatchUpperOffset: () => 5 };
    expect(fillMissingCatalogLevel("14", 146, policy)).toEqual({ levelPrecise: 140, estimated: true, reason: "mismatched" });
    expect(fillMissingCatalogLevel("14", 139, policy)).toEqual({ levelPrecise: 140, estimated: true, reason: "mismatched" });
    expect(fillMissingCatalogLevel("14", 145, policy)).toEqual({ levelPrecise: 145, estimated: false });
  });
});

describe("fillMissingStage", () => {
  const context = (): CatalogFetchContext => ({
    region: "jp", version: 9, session: { cookies: "" }, log: pino({ enabled: false }), notice: { details: [], addDetail: vi.fn() },
  });
  const chart: SourceChart = { game: "chunithm", songName: "Chart", chartType: 0, difficulty: 3, level: "14+" };
  const stage = fillMissingStage({ toPrecise: level => parseDisplayLevel(level, 5) });

  it("records estimates without replacing known values, and reports the counts", async () => {
    const ctx = context();
    const [estimated, confirmed] = await stage.run(ctx, [chart, { ...chart, levelPrecise: important(149) }]);
    expect(estimated).toMatchObject({ levelPrecise: 145, metadata: { levelPreciseEstimated: true } });
    expect(confirmed).toEqual({ ...chart, levelPrecise: important(149) });
    expect(ctx.notice.addDetail).toHaveBeenCalledWith("1 missing, 0 mismatched level precise values fixed");
  });

  it("keeps an earlier estimate flag and requires a display level", async () => {
    const [kept] = await stage.run(context(), [{ ...chart, levelPrecise: 146, metadata: { levelPreciseEstimated: true } }]);
    expect(kept).toMatchObject({ levelPrecise: 146, metadata: { levelPreciseEstimated: true } });
    await expect(stage.run(context(), [{ ...chart, level: undefined }])).rejects.toThrow("Value is null or undefined for level: Chart MASTER");
  });
});
