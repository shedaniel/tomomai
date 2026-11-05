import { describe, expect, it } from "vitest";
import { CANONICAL_GAME_IDS, REGIONS } from "./ids";
import { getGameSite, siteUrl } from "./sites";

describe("game sites", () => {
  it("keeps absolute paths and URLs on the site's origin and refuses other origins", () => {
    expect(siteUrl("chunithm", "jp", "/").href).toBe("https://new.chunithm-net.com/");
    expect(siteUrl("maimai", "intl", "https://maimaidx-eng.com/maimai-mobile/?ssid=callback").href).toBe("https://maimaidx-eng.com/maimai-mobile/?ssid=callback");
    expect(() => siteUrl("maimai", "intl", "https://maimaidx.jp/maimai-mobile/")).toThrow("Unexpected game site origin for maimai/intl");
    expect(() => siteUrl("chunithm", "intl", "//maimaidx-eng.com/maimai-mobile/")).toThrow("Unexpected game site origin");
  });

  it("skips certificate verification only for the maimai sites whose chain Node cannot verify", () => {
    const legacy = CANONICAL_GAME_IDS.flatMap(game => REGIONS.filter(region => getGameSite(game, region)?.legacyTls).map(region => `${game}/${region}`));
    expect(legacy).toEqual(["maimai/jp", "maimai/cn"]);
  });
});
