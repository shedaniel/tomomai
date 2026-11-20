import { describe, expect, it } from "vitest";
import { fillSiteMatches, siteMatchPatterns } from "./site-match";

describe("siteMatchPatterns", () => {
  it("covers the serving site and the peer sites", () => {
    expect(siteMatchPatterns("https://main.example.test", ["https://chu.example.test:8443"])).toEqual([
      "https://main.example.test/*",
      "https://chu.example.test/*",
    ]);
  });

  it("covers only the serving site without peers, on every port", () => {
    expect(siteMatchPatterns("http://localhost:3001", [])).toEqual(["http://localhost/*"]);
  });

  it("lists the serving site once when it is also a peer", () => {
    expect(siteMatchPatterns("https://chu.example.test", ["https://chu.example.test", "https://main.example.test"])).toEqual([
      "https://chu.example.test/*",
      "https://main.example.test/*",
    ]);
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
