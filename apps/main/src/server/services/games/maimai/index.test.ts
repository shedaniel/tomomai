import { afterEach, describe, expect, it, vi } from "vitest";
import { GAME_SERVER_MODULES } from "../registry";

vi.mock("@/lib/db", () => ({ db: {} }));

afterEach(() => vi.unstubAllEnvs());

describe("maimai score source", () => {
  it("refuses a stored CN proxy session, which its first fetch consumed, and nothing else", () => {
    const { rejectStoredToken } = GAME_SERVER_MODULES.maimai.scores;
    expect(rejectStoredToken?.("cn-cookies://userId=1")).toMatchObject({ code: "CN_COOKIES_SINGLE_USE" });
    expect(rejectStoredToken?.("lxns://a:://r:://0:://read")).toBeNull();
    expect(rejectStoredToken?.("account://name:://pass")).toBeNull();
    expect(rejectStoredToken?.("unreadable")).toBeNull();
  });
});

describe("maimai reserved profiles", () => {
  it("resolve reserved usernames case-insensitively and nothing else", async () => {
    await expect(GAME_SERVER_MODULES.maimai.reserved?.user("MAX")).resolves.toMatchObject({ id: "reserved-max", publishProfile: true });
    await expect(GAME_SERVER_MODULES.maimai.reserved?.user("someone")).resolves.toBeNull();
  });

  it("keep a concrete main region when maimai has no enabled region", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "");
    await expect(GAME_SERVER_MODULES.maimai.reserved?.user("maxbas")).resolves.toMatchObject({ profileMainRegion: "intl" });
  });
});
