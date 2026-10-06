import { describe, expect, it } from "vitest";
import { isProxiedImageUrl } from "./images";

describe("image proxy allowlist", () => {
  it("accepts only the exact maimai hosts over plain https", () => {
    for (const host of ["maimaidx.jp", "maimaidx-eng.com", "cdn.gamerch.com", "maimai.sega.jp"]) {
      expect(isProxiedImageUrl(`https://${host}/img/a.png`)).toBe(true);
    }
    for (const url of [
      "http://maimaidx.jp/img/a.png",
      "https://maimaidx.jp:8443/img/a.png",
      "https://user:pass@maimaidx.jp/img/a.png",
      "https://evil.maimaidx.jp/img/a.png",
      "https://maimaidx.jp.evil.com/img/a.png",
      "https://chunithm-net.com/img/a.png",
      "/covers/a.webp",
    ]) {
      expect(isProxiedImageUrl(url)).toBe(false);
    }
  });
});
