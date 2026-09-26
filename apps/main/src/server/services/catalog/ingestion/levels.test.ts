import { describe, expect, it } from "vitest";
import { fillMissingCatalogLevel } from "./levels";

describe("catalog level fallback", () => {
  it("fills missing values and preserves confirmed values when the policy has no mismatch repair", () => {
    const policy = { toPrecise: () => 140 };
    expect(fillMissingCatalogLevel("14", undefined, policy)).toEqual({ levelPrecise: 140, estimated: true, reason: "missing" });
    expect(fillMissingCatalogLevel("14", 149, policy)).toEqual({ levelPrecise: 149, estimated: false });
  });
});
