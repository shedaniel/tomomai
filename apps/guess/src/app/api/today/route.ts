import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@tomomai/security/rate-limit";
import { readLimiter } from "@/lib/rate-limit";
import { getToday, TOTAL_STEPS } from "@/lib/today";
import { readDateOverride } from "@/lib/route-date";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, readLimiter);
  if (limited) return limited;

  const override = readDateOverride(req);
  if (override === "invalid") {
    return NextResponse.json({ error: "invalid date" }, { status: 404 });
  }
  const { dateKey } = await getToday(override ?? undefined);
  return NextResponse.json({ dateKey, totalSteps: TOTAL_STEPS });
}
