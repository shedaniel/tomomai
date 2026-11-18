import { describe, expect, it } from "vitest";
import { GAMES, GAME_IDS } from "@tomomai/userscript/games";
import { getGame } from "@/lib/games/registry";

// The userscript carries its own copy of each game's SEGA sites, since it runs on SEGA's pages.
describe("userscript games", () => {
  it.each(GAME_IDS)("matches the %s definition", id => {
    const { brand, sites, loginMethods } = getGame(id);
    const intl = sites.intl!;
    expect(GAMES[id]).toMatchObject({
      product: brand.productName,
      netName: brand.netName,
      netOrigin: intl.origin,
      netRoot: intl.mobileRoot,
      aime: intl.aime,
    });
    expect(loginMethods.intl).toContain("sega-cookie");
  });
});
