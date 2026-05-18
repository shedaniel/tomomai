import { NextRequest, NextResponse } from "next/server";
import { verifyAltchaPayload } from "@/lib/altcha";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const ok = await verifyAltchaPayload(body?.payload);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "Invalid captcha solution" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
