import { describe, expect, it } from "vitest";
import { fillSiteMatches, siteMatchPatterns } from "./site-match";

describe("siteMatchPatterns", () => {
  it("covers the serving site and every game's site", () => {
    expect(siteMatchPatterns("http://localhost:3001")).toEqual([
      "http://localhost/*",
      "https://tomomai.lol/*",
      "https://chu.tomochu.lol/*",
    ]);
  });

  it("lists a game's site once when it serves the script", () => {
    expect(siteMatchPatterns("https://chu.tomochu.lol")).toEqual(["https://chu.tomochu.lol/*", "https://tomomai.lol/*"]);
  });
});

describe("fillSiteMatches", () => {
  it("writes one @match line per pattern in place of the placeholder", () => {
    const header = [
      "// @match        https://lng-tgk-aime-gw.am-all.net/common_auth/*",
      "// @match        __TOMOMAI_SITE_MATCH__",
      "// @connect      example.test",
    ].join("\n");
    expect(fillSiteMatches(header, ["https://a.test/*", "https://b.test/*"])).toBe([
      "// @match        https://lng-tgk-aime-gw.am-all.net/common_auth/*",
      "// @match        https://a.test/*",
      "// @match        https://b.test/*",
      "// @connect      example.test",
    ].join("\n"));
  });
});
