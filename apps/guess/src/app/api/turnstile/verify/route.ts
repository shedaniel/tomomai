import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@tomomai/security/rate-limit";
import { verifyTurnstileToken } from "@tomomai/security/turnstile";
import { turnstileVerifyLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, turnstileVerifyLimiter);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const result = await verifyTurnstileToken({
    token: body?.token,
    secretKey: process.env.TURNSTILE_SECRET_KEY,
    remoteIp: clientIp(req),
    expectedAction: "site-access",
    expectedHostname: process.env.TURNSTILE_EXPECTED_HOSTNAME,
  });

  if (result.success) {
    return NextResponse.json({ ok: true });
  }

  const unavailable =
    result.reason === "misconfigured" || result.reason === "unavailable";
  return NextResponse.json(
    { error: unavailable ? "turnstile unavailable" : "invalid turnstile proof" },
    { status: unavailable ? 503 : 403 },
  );
}
