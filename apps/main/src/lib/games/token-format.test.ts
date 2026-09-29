import { describe, expect, it } from "vitest";
import { isTokenError } from "@/lib/token-errors";
import {
  formatCnCookies,
  formatDivingFish,
  formatLxns,
  formatSegaAccount,
  formatSegaCookie,
  parseToken,
  TOKEN_PROVIDERS,
} from "./token-format";

describe("token formats", () => {
  it("reads back every token it writes", () => {
    expect(parseToken(formatSegaAccount("name", "p@ss"))).toEqual({ provider: "sega-account", username: "name", password: "p@ss" });
    expect(parseToken(formatSegaAccount("name", "p@ss", "saved"))).toEqual({ provider: "sega-account", username: "name", password: "p@ss", clal: "saved" });
    expect(parseToken(formatSegaCookie("clal=abc123"))).toEqual({ provider: "sega-cookie", clal: "abc123" });
    expect(parseToken(formatCnCookies("userId=1; _t=2"))).toEqual({ provider: "cn-cookies", cookies: "userId=1; _t=2" });
    expect(parseToken(formatLxns({ accessToken: "a", refreshToken: "r", expiresAtMs: 42, scope: "read" })))
      .toEqual({ provider: "lxns", accessToken: "a", refreshToken: "r", expiresAtMs: 42, scope: "read" });
    expect(parseToken(formatDivingFish({ kind: "qq", value: "12345" }))).toEqual({ provider: "divingfish", account: { kind: "qq", value: "12345" } });
  });

  it("writes the stored formats the server has always read", () => {
    expect(formatSegaAccount("name", "pass")).toBe("account://name:://pass");
    expect(formatSegaAccount("name", "pass", "clal")).toBe("account://clal:://name:://pass");
    expect(formatSegaCookie(" abc ")).toBe("cookie://abc");
    expect(parseToken(" cookie://clal=legacy ")).toEqual({ provider: "sega-cookie", clal: "legacy" });
  });

  it.each([
    "",
    "clal=abc",
    "cookie://",
    "cookie://ｃｌａｌ",
    "account://name",
    "account://name:://",
    "cn-cookies://",
    "lxns://access:://refresh:://soon:://read",
    "lxns://access:://refresh",
    "divingfish://email:://someone",
    "divingfish://qq:://",
  ])("refuses %j as an invalid token the player has to replace", token => {
    const parsed = parseToken(token);
    expect(parsed.provider).toBeNull();
    if (parsed.provider !== null) return;
    expect(parsed.error).toMatch(/^Invalid token format\. /);
    expect(isTokenError(parsed.error)).toBe(true);
  });

  it("marks only the CN proxy cookies as single-use", () => {
    expect(Object.entries(TOKEN_PROVIDERS).filter(([, facts]) => facts.singleUse).map(([provider]) => provider)).toEqual(["cn-cookies"]);
  });
});
