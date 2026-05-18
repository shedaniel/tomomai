import { NextRequest, NextResponse } from "next/server";
import { createAltchaChallenge } from "@/lib/altcha";
import { captchaChallengeLimiter, rateLimit } from "@/lib/security/redis-rate-limit";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, captchaChallengeLimiter);
  if (limited) return limited;
  const challenge = await createAltchaChallenge();
  return NextResponse.json(challenge);
}
