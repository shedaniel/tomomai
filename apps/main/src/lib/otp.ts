import { totp } from "otplib";
import { createHmac, timingSafeEqual } from "crypto";
import { gameIdSchema } from "./games/schema";
import type { CanonicalGameId } from "./games/types";

const OTP_PERIOD_SECONDS = 600;
const OTP_DIGITS = 6;

const configuredTotp = totp.clone({
  digits: OTP_DIGITS,
  step: OTP_PERIOD_SECONDS,
});

function getMasterSecret(): string {
  const secret = process.env.MAIMAI_TOTP_SECRET;
  if (!secret) {
    throw new Error("MAIMAI_TOTP_SECRET environment variable is not set");
  }
  return secret;
}

function deriveUserKey(userId: string): string {
  return createHmac("sha256", getMasterSecret()).update(userId).digest("hex");
}

export function createLoginAuthorization(userId: string, game: CanonicalGameId): string {
  const payload = Buffer.from(JSON.stringify({ userId, game }), "utf8").toString("base64url");
  const signed = `v1.${payload}`;
  const signature = createHmac("sha256", getMasterSecret())
    .update(signed)
    .digest("base64url");
  return `${signed}.${signature}`;
}

export function decodeLoginAuthorization(opaque: string): { userId: string; game: CanonicalGameId } | null {
  const parts = opaque.split(".");
  const versioned = parts.length === 3 && parts[0] === "v1";
  if (!versioned && parts.length !== 2) return null;
  const [payload, signature] = versioned ? parts.slice(1) : parts;
  if (!payload || !signature) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSignature = createHmac("sha256", getMasterSecret())
    .update(versioned ? `v1.${payload}` : decoded)
    .digest("base64url");

  const provided = Buffer.from(signature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  // Existing gateway links carry a signed user ID and authorize maimai only.
  if (!versioned) return { userId: decoded, game: "maimai" };
  try {
    const authorization: unknown = JSON.parse(decoded);
    if (!authorization || typeof authorization !== "object" || !("userId" in authorization) || typeof authorization.userId !== "string" || !("game" in authorization)) return null;
    const game = gameIdSchema.safeParse(authorization.game);
    return game.success ? { userId: authorization.userId, game: game.data } : null;
  } catch {
    return null;
  }
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
