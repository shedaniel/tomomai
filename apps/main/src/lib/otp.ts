import { totp } from "otplib";
import { createHmac } from "crypto";
import { z } from "zod";
import { gameIdSchema, regionSchema } from "./games/schema";
import type { CanonicalGameId, Region } from "./games/ids";
import { sign, verify } from "./signed-token";

const OTP_PERIOD_SECONDS = 600;
const OTP_DIGITS = 6;

const configuredTotp = totp.clone({
  digits: OTP_DIGITS,
  step: OTP_PERIOD_SECONDS,
});

function getMasterSecret(): string {
  const secret = process.env.LOGIN_TOKEN_SECRET || process.env.MAIMAI_TOTP_SECRET;
  if (!secret) {
    throw new Error("LOGIN_TOKEN_SECRET environment variable is not set");
  }
  return secret;
}

function deriveUserKey(userId: string): string {
  return createHmac("sha256", getMasterSecret()).update(userId).digest("hex");
}

export type LoginAuthorization = { userId: string; game: CanonicalGameId; region: Region };

const loginAuthorizationSchema = z.strictObject({ userId: z.string().min(1), game: gameIdSchema, region: regionSchema, exp: z.number() });

/** Names who a gateway cookie login is for. It lives as long as an OTP period. */
export function createLoginAuthorization(authorization: LoginAuthorization): string {
  return sign(authorization, { secret: getMasterSecret(), ttlSeconds: OTP_PERIOD_SECONDS });
}

export function decodeLoginAuthorization(token: string): LoginAuthorization | null {
  const claims = verify(token, loginAuthorizationSchema, { secret: getMasterSecret() });
  return claims && { userId: claims.userId, game: claims.game, region: claims.region };
}

export function generateUserOtp(userId: string): string {
  return configuredTotp.generate(deriveUserKey(userId));
}

export function verifyUserOtp(userId: string, token: string): boolean {
  if (!token) {
    return false;
  }
  return configuredTotp.check(token, deriveUserKey(userId));
}

export function getOtpExpiryTimestamp(): number {
  const step = OTP_PERIOD_SECONDS * 1000;
  return Math.ceil(Date.now() / step) * step;
}
