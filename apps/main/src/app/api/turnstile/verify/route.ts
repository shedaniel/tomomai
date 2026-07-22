import { NextRequest, NextResponse } from "next/server";
import { verifyTurnstileToken } from "@tomomai/security/turnstile";
import { captchaVerifyLimiter, clientIp, rateLimit } from "@/lib/security/redis-rate-limit";

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, captchaVerifyLimiter);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  const verification = await verifyTurnstileToken({
    token: body?.token,
    secretKey,
    remoteIp: clientIp(request),
    expectedAction: "site-access",
    expectedHostname: process.env.TURNSTILE_EXPECTED_HOSTNAME || undefined,
  });

  if (verification.success) {
    return NextResponse.json({ ok: true });
  }
  if (verification.reason === "invalid") {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  return NextResponse.json({ ok: false }, { status: 503 });
}
