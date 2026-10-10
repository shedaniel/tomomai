import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createLoginAuthorization, decodeLoginAuthorization } from "./otp";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  vi.stubEnv("LOGIN_TOKEN_SECRET", "login-secret");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("binds the user, game and region for one OTP period", () => {
  const authorization = createLoginAuthorization({ userId: "player", game: "chunithm", region: "intl" });
  expect(decodeLoginAuthorization(authorization)).toEqual({ userId: "player", game: "chunithm", region: "intl" });
  vi.advanceTimersByTime(600_000);
  expect(decodeLoginAuthorization(authorization)).toBeNull();
});

it("signs with the former secret name until the new one is set", () => {
  vi.stubEnv("LOGIN_TOKEN_SECRET", "");
  vi.stubEnv("MAIMAI_TOTP_SECRET", "former-secret");
  const authorization = createLoginAuthorization({ userId: "player", game: "maimai", region: "intl" });
  expect(decodeLoginAuthorization(authorization)).not.toBeNull();
  vi.stubEnv("LOGIN_TOKEN_SECRET", "login-secret");
  expect(decodeLoginAuthorization(authorization)).toBeNull();
});
