import { describe, expect, it } from "vitest";
import { fillMissingCatalogLevel } from "./catalog-levels";

describe("shared catalog level fallback", () => {
  it("uses the game's plus threshold without replacing known source constants", () => {
    expect(fillMissingCatalogLevel("14", undefined, { plusOffset: 5 })).toEqual({ levelPrecise: 140, estimated: true, reason: "missing" });
    expect(fillMissingCatalogLevel("14+", undefined, { plusOffset: 5 })).toEqual({ levelPrecise: 145, estimated: true, reason: "missing" });
    expect(fillMissingCatalogLevel("14+", 149, { plusOffset: 5 })).toEqual({ levelPrecise: 149, estimated: false, reason: null });
  });

  it("preserves maimai's modern and historical plus thresholds and mismatch bounds", () => {
    const policy = { plusOffset: 6, mismatchUpperOffset: (minimum: number) => minimum < 70 ? 9 : 5 };
    expect(fillMissingCatalogLevel("14+", undefined, policy).levelPrecise).toBe(146);
    expect(fillMissingCatalogLevel("14+", undefined, { ...policy, plusOffset: 7 }).levelPrecise).toBe(147);
    expect(fillMissingCatalogLevel("14", 149, policy)).toEqual({ levelPrecise: 140, estimated: true, reason: "mismatched" });
    expect(fillMissingCatalogLevel("6", 69, policy)).toEqual({ levelPrecise: 69, estimated: false, reason: null });
  });

  it("does not fabricate a level for malformed or missing display data", () => {
    expect(fillMissingCatalogLevel(undefined, undefined, { plusOffset: 5 }).levelPrecise).toBeNull();
    expect(fillMissingCatalogLevel("?", undefined, { plusOffset: 5 }).levelPrecise).toBeNull();
    expect(fillMissingCatalogLevel("?", 145, { plusOffset: 5 }).levelPrecise).toBe(145);
  });
});
