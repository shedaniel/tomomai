import { createChallenge } from "altcha-lib/v1";
import { NextResponse } from "next/server";

const HMAC_KEY = process.env.ALTCHA_HMAC_KEY ?? "development-altcha-key-change-in-production";

export async function GET() {
  const challenge = await createChallenge({ hmacKey: HMAC_KEY, maxNumber: 50000 });
  return NextResponse.json(challenge);
}
