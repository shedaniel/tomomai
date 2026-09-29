import { describe, expect, it } from "vitest";
import { CANONICAL_GAME_IDS, REGIONS } from "./ids";
import { SEGA_AIME_GATEWAY, getGameSite, siteOrigin, siteRoot, siteUrl } from "./sites";

describe("game sites", () => {
  it.each([
    ["maimai", "intl", "https://maimaidx-eng.com/maimai-mobile/playerData/"],
    ["maimai", "jp", "https://maimaidx.jp/maimai-mobile/playerData/"],
    ["maimai", "cn", "https://maimai.wahlap.com/maimai-mobile/playerData/"],
    ["chunithm", "intl", "https://chunithm-net-eng.com/mobile/playerData/"],
    ["chunithm", "jp", "https://new.chunithm-net.com/chuni-mobile/html/mobile/playerData/"],
  ] as const)("resolves %s %s paths against the mobile root", (game, region, expected) => {
    expect(siteUrl(game, region, "playerData/").href).toBe(expected);
    expect(siteUrl(game, region).href).toBe(siteRoot(game, region).href);
    expect(new URL(expected).origin).toBe(siteOrigin(game, region));
  });

  it("keeps absolute paths and URLs on the site's origin and refuses other origins", () => {
    expect(siteUrl("chunithm", "jp", "/").href).toBe("https://new.chunithm-net.com/");
    expect(siteUrl("maimai", "intl", "https://maimaidx-eng.com/maimai-mobile/?ssid=callback").href).toBe("https://maimaidx-eng.com/maimai-mobile/?ssid=callback");
    expect(() => siteUrl("maimai", "intl", "https://maimaidx.jp/maimai-mobile/")).toThrow("Unexpected game site origin for maimai/intl");
    expect(() => siteUrl("chunithm", "intl", "//maimaidx-eng.com/maimai-mobile/")).toThrow("Unexpected game site origin");
  });

  it("rejects a region the game has no site for", () => {
    expect(() => siteRoot("chunithm", "cn")).toThrow(expect.objectContaining({ code: "UNSUPPORTED_REGION", game: "chunithm", region: "cn" }));
  });

  it("skips certificate verification only for the maimai sites whose chain Node cannot verify", () => {
    const legacy = CANONICAL_GAME_IDS.flatMap(game => REGIONS.filter(region => getGameSite(game, region)?.legacyTls).map(region => `${game}/${region}`));
    expect(legacy).toEqual(["maimai/jp", "maimai/cn"]);
  });
});

describe("SEGA Aime gateway", () => {
  it.each([
    ["maimai", { site_id: "maimaidxex", redirect_url: "https://maimaidx-eng.com/maimai-mobile/", back_url: "https://maimai.sega.com/" }],
    ["chunithm", { site_id: "chuniex", redirect_url: "https://chunithm-net-eng.com/mobile/", back_url: "https://chunithm.sega.com/" }],
  ] as const)("sends the %s International login back to its mobile root", (game, params) => {
    const url = new URL(SEGA_AIME_GATEWAY.loginUrl(game, "intl"));
    expect(`${url.origin}${url.pathname}`).toBe(`${SEGA_AIME_GATEWAY.origin}/common_auth/login`);
    expect(Object.fromEntries(url.searchParams)).toEqual(params);
  });

  it("refuses a site that does not sign in through the gateway", () => {
    expect(() => SEGA_AIME_GATEWAY.loginUrl("maimai", "jp")).toThrow("maimai DX jp does not sign in through the SEGA Aime gateway");
  });
});
