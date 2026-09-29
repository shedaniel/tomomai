import { afterEach, describe, expect, it, vi } from "vitest";
import { isProxiedImageUrl, resolveImageUrl } from "./images";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

describe("resolveImageUrl", () => {
  it("routes proxied hosts through the image proxy", () => {
    expect(resolveImageUrl("https://maimaidx.jp/img/a b.png")).toBe(`/api/image-proxy?url=${encodeURIComponent("https://maimaidx.jp/img/a b.png")}`);
  });

  it("moves R2 assets to the CN CDN only for visitors in China", () => {
    vi.stubEnv("NEXT_PUBLIC_R2_URL", "https://r2.example");
    vi.stubEnv("NEXT_PUBLIC_R2_URL_CN", "https://r2-cn.example");
    expect(resolveImageUrl("https://r2.example/covers/a.webp")).toBe("https://r2.example/covers/a.webp");

    vi.stubGlobal("document", { cookie: "theme=dark; country=CN" });
    expect(resolveImageUrl("https://r2.example/covers/a.webp")).toBe("https://r2-cn.example/covers/a.webp");
    expect(resolveImageUrl("https://other.example/a.webp")).toBe("https://other.example/a.webp");
  });
});
