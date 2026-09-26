import { describe, expect, it, vi } from "vitest";
import { fillMissingCatalogLevel, parseDisplayLevel } from "@/server/services/catalog/ingestion/levels";
import { levelToPrecise } from "@/server/utils/level";

vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ warn: vi.fn() }) }));
const chunithm = { toPrecise: (level: string) => parseDisplayLevel(level, 5) };

describe("shared catalog level fallback", () => {
  it("uses the game's plus threshold without replacing known source constants", () => {
    expect(fillMissingCatalogLevel("14", undefined, chunithm)).toEqual({ levelPrecise: 140, estimated: true, reason: "missing" });
    expect(fillMissingCatalogLevel("14+", undefined, chunithm)).toEqual({ levelPrecise: 145, estimated: true, reason: "missing" });
    expect(fillMissingCatalogLevel("14+", 149, chunithm)).toEqual({ levelPrecise: 149, estimated: false });
  });

  it("preserves maimai's modern and historical plus thresholds and mismatch bounds", () => {
    const policy = { toPrecise: (level: string) => levelToPrecise(level, 9), mismatchUpperOffset: (minimum: number) => minimum < 70 ? 9 : 5 };
    expect(fillMissingCatalogLevel("14+", undefined, policy).levelPrecise).toBe(146);
    expect(fillMissingCatalogLevel("14+", undefined, { ...policy, toPrecise: level => levelToPrecise(level, 8) }).levelPrecise).toBe(147);
    expect(fillMissingCatalogLevel("14", 149, policy)).toEqual({ levelPrecise: 140, estimated: true, reason: "mismatched" });
    expect(fillMissingCatalogLevel("6", 69, policy)).toEqual({ levelPrecise: 69, estimated: false });
  });

  it("preserves the existing parser's whitespace, parseInt and invalid-level fallback behavior", () => {
    expect(parseDisplayLevel(" 14+ ", 5)).toBe(145);
    expect(levelToPrecise("14.5", 9)).toBe(140);
    expect(levelToPrecise("?", 9)).toBe(10);
    expect(levelToPrecise("?+", 9)).toBe(10);
  });
});
