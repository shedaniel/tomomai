import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_GAME_IDS } from "@/lib/games/ids";
import { getSupportedRegions } from "@/lib/games/regions";
import { getCurrentVersion } from "@/lib/games/versions";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import { authenticateCatalogSource, catalogRequiresToken } from "./collect";

const login = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/games/maimai/login", () => ({ loginAndGetCookies: login }));

beforeEach(() => vi.clearAllMocks());

describe("catalog sources", () => {
  it.each(CANONICAL_GAME_IDS)("%s names its source stages and levels for every supported region", async game => {
    const source = GAME_SERVER_MODULES[game].catalog;
    for (const region of getSupportedRegions(game)) {
      const stages = await source.stages(region);
      expect(stages.length).toBeGreaterThan(0);
      for (const stage of stages) expect(stage).toEqual({ name: expect.any(String), run: expect.any(Function) });
      expect(source.levelPolicy(getCurrentVersion(game, region)).toPrecise("10+")).toBeGreaterThan(100);
    }
  });
});

describe("catalog source authentication", () => {
  it("logs in only where the source needs a player session", async () => {
    login.mockResolvedValue("source-cookie");
    expect(catalogRequiresToken("maimai", "jp")).toBe(true);
    await expect(authenticateCatalogSource("maimai", "jp", "player-token")).resolves.toBe("source-cookie");
    expect(login).toHaveBeenCalledExactlyOnceWith("jp", "player-token");
    await expect(authenticateCatalogSource("maimai", "jp", null)).rejects.toThrow("Missing 'token' query parameter");

    expect(catalogRequiresToken("maimai", "cn")).toBe(false);
    expect(catalogRequiresToken("chunithm", "jp")).toBe(false);
    await expect(authenticateCatalogSource("chunithm", "jp", null)).resolves.toBe("");
    expect(login).toHaveBeenCalledOnce();
  });
});
