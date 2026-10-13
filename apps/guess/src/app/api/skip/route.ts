import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@tomomai/security/rate-limit";
import { isTracked, recordAction, resolveOwner, toState } from "@/lib/attempts";
import { submitLimiter } from "@/lib/rate-limit";
import { readPlayDateKey } from "@/lib/route-date";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, submitLimiter);
  if (limited) return limited;

  const dateKey = readPlayDateKey(req);
  if (dateKey === "invalid") return NextResponse.json({ error: "invalid date" }, { status: 404 });
  if (!isTracked(dateKey)) return NextResponse.json({ attempt: null });

  const owner = await resolveOwner(true);
  const row = owner ? await recordAction(owner, dateKey, "skipped") : null;
  return NextResponse.json({ attempt: row ? toState(row) : null });
}
