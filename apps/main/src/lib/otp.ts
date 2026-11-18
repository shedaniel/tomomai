import { totp } from "otplib";
import { createHmac } from "crypto";

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

export function generateUserOtp(userId: string): string {
  return configuredTotp.generate(deriveUserKey(userId));
}

export function getOtpExpiryTimestamp(): number {
  const step = OTP_PERIOD_SECONDS * 1000;
  return Math.ceil(Date.now() / step) * step;
}
