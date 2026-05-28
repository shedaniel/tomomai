import { totp } from "otplib";
import { createHmac, timingSafeEqual } from "crypto";

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

export function createOpaqueUserId(userId: string): string {
  const payload = Buffer.from(userId, "utf8").toString("base64url");
  const signature = createHmac("sha256", getMasterSecret())
    .update(userId)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function decodeOpaqueUserId(opaque: string): string | null {
  const [payload, signature] = opaque.split(".");
  if (!payload || !signature) {
    return null;
  }

  let userId: string;
  try {
    userId = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSignature = createHmac("sha256", getMasterSecret())
    .update(userId)
    .digest("base64url");

  const provided = Buffer.from(signature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  return userId;
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
