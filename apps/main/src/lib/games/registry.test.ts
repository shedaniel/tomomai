import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnabledRegions, normalizeGameId, requireCapability, resolveGameContext } from "./registry";

afterEach(() => vi.unstubAllEnvs());

describe("game boundaries", () => {
  it("canonicalizes aliases only at resolution", () => {
    expect(normalizeGameId("maimaidx")).toBe("maimai");
    expect(normalizeGameId("tomomai")).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp");
    expect(resolveGameContext("maimaidx", "jp", "scores")).toEqual({ game: "maimai", region: "jp" });
  });
  it("honors explicit empty configuration and rejects disabled regions", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "");
    expect(getEnabledRegions("maimai")).toEqual([]);
    expect(() => resolveGameContext("maimai", "jp")).toThrow(expect.objectContaining({ code: "UNSUPPORTED_REGION" }));
  });
  it("filters and deduplicates configured regions", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp, invalid, jp,cn");
    expect(getEnabledRegions("maimai")).toEqual(["jp", "cn"]);
  });
  it("enables CHUNITHM fetching only for configured supported regions", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", undefined);
    for (const region of ["intl", "jp"] as const) {
      expect(resolveGameContext("chunithm", region, "catalog")).toEqual({ game: "chunithm", region });
      expect(resolveGameContext("chunithm", region, "scores")).toEqual({ game: "chunithm", region });
    }
    expect(() => requireCapability("chunithm", "albums")).toThrow(expect.objectContaining({ code: "UNSUPPORTED_CAPABILITY" }));
    expect(() => resolveGameContext("chunithm", "cn", "scores")).toThrow(expect.objectContaining({ code: "UNSUPPORTED_REGION" }));
  });
  it("respects explicit CHUNITHM catalog regions, including none", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", "jp,cn,jp");
    expect(getEnabledRegions("chunithm")).toEqual(["jp"]);
    expect(() => resolveGameContext("chunithm", "intl", "catalog")).toThrow(expect.objectContaining({ code: "UNSUPPORTED_REGION" }));
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", "");
    expect(() => resolveGameContext("chunithm", "jp", "catalog")).toThrow(expect.objectContaining({ code: "UNSUPPORTED_REGION" }));
  });
});
