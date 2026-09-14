import { describe, expect, it } from "vitest";
import { sealSession, type TakeoutSession, unsealSession } from "./session";

describe("session sealing", () => {
  it("round trips a sealed session", async () => {
    process.env.TAKEOUT_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
    const session: TakeoutSession = {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: 1_800_000_000_000,
      scope: "read offline_access",
    };

    await expect(unsealSession(await sealSession(session))).resolves.toEqual(session);
  });

  it("returns null for malformed cookie values", async () => {
    process.env.TAKEOUT_SESSION_SECRET = "0123456789abcdef0123456789abcdef";

    await expect(unsealSession("not-a-valid-cookie")).resolves.toBeNull();
  });
});
