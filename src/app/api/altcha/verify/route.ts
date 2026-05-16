import { verifySolution } from "altcha-lib/v1";
import { NextRequest, NextResponse } from "next/server";

const HMAC_KEY = process.env.ALTCHA_HMAC_KEY ?? "development-altcha-key-change-in-production";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const payload = body?.payload;

  if (!payload || typeof payload !== "string") {
    return NextResponse.json({ ok: false, error: "Missing payload" }, { status: 400 });
  }

  const ok = await verifySolution(payload, HMAC_KEY);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "Invalid captcha solution" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
