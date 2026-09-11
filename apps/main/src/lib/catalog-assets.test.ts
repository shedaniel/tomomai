import { afterEach, describe, expect, it, vi } from "vitest";
import { getTypeBadgeUrl, isR2Url } from "./utils";
afterEach(() => vi.unstubAllEnvs());
describe("catalog assets", () => {
  it("does not read chart badges from a self-hoster's user-asset bucket", () => {
    vi.stubEnv("NEXT_PUBLIC_R2_URL", "https://user-assets.example.test");
    vi.stubEnv("NEXT_PUBLIC_CATALOG_COVER_BASE_URL", undefined);
    expect(getTypeBadgeUrl("dx")).toBe("https://cdn.tomomai.lol/covers/music_dx.webp");
  });
  it("uses the configured catalog origin without reoptimizing its images", () => {
    vi.stubEnv("NEXT_PUBLIC_CATALOG_COVER_BASE_URL", "https://catalog.example.test/");
    const url = getTypeBadgeUrl("std");
    expect(url).toBe("https://catalog.example.test/covers/music_standard.webp");
    expect(isR2Url(url)).toBe(true);
  });
});
