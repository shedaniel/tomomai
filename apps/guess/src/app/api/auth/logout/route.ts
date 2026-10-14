import { NextResponse } from "next/server";
import { destroySession } from "@/lib/accounts/session";

export const runtime = "nodejs";

export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
