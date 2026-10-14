import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ remove: vi.fn(), warn: vi.fn() }));
vi.mock("./tokens", () => ({ deleteToken: mocks.remove }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ warn: mocks.warn }) }));

import { acceptSegaToken, acceptToken } from "./token-policy";

beforeEach(() => vi.clearAllMocks());

describe("token policy", () => {
  it.each([
    { game: "maimai", region: "intl", token: "cookie://abc", provider: "sega-cookie" },
    { game: "maimai", region: "jp", token: "account://name:://pass", provider: "sega-account" },
    { game: "maimai", region: "cn", token: "lxns://a:://r:://0:://read", provider: "lxns" },
    { game: "maimai", region: "cn", token: "divingfish://qq:://1", provider: "divingfish" },
    { game: "chunithm", region: "intl", token: "cookie://abc", provider: "sega-cookie" },
  ] as const)("accepts a $provider token for $game $region", async ({ game, region, token, provider }) => {
    expect(await acceptToken(game, "player", region, token)).toMatchObject({ provider });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each([
    { game: "maimai", region: "intl", token: "lxns://a:://r:://0:://read" },
    { game: "maimai", region: "cn", token: "account://name:://pass" },
    { game: "maimai", region: "jp", token: "cookie://abc" },
    { game: "chunithm", region: "jp", token: "cookie://abc" },
  ] as const)("deletes a $token token $game $region does not sign in with", async ({ game, region, token }) => {
    await expect(acceptToken(game, "player", region, token)).rejects.toThrow("Invalid token format. This kind of token is not supported in this region.");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(game, "player", region);
    expect(mocks.warn).toHaveBeenCalledWith({ game, region, userId: "player" }, "Refused a token that cannot sign in");
  });

  it("deletes an unreadable token with the reason it cannot be read", async () => {
    await expect(acceptToken("maimai", "player", "intl", "account://name:://")).rejects.toThrow("Username and password cannot be empty");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("maimai", "player", "intl");
  });

  it("deletes nothing without a player", async () => {
    await expect(acceptToken("maimai", null, "intl", "nonsense")).rejects.toThrow("Invalid token format");
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("gives SEGA sign-ins only a SEGA token, even where the region accepts others", async () => {
    expect(await acceptSegaToken("chunithm", "player", "jp", "account://name:://pass")).toEqual({ provider: "sega-account", username: "name", password: "pass" });
    await expect(acceptSegaToken("maimai", "player", "cn", "cn-cookies://userId=1")).rejects.toThrow("not supported in this region");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("maimai", "player", "cn");
  });
});
