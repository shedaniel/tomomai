import { NextRequest, NextResponse } from "next/server";
import { verifyAltchaPayload } from "@/lib/altcha";
import { captchaVerifyLimiter, rateLimit } from "@/lib/security/redis-rate-limit";

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, captchaVerifyLimiter);
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const ok = await verifyAltchaPayload(body?.payload);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "Invalid captcha solution" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
