import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@tomomai/security/rate-limit";
import { submitLimiter } from "@/lib/rate-limit";
import { buildReveal, getToday } from "@/lib/today";
import { isGuessCorrect } from "@/lib/fuzzy";
import { readDateOverride } from "@/lib/route-date";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, submitLimiter);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    | { guess?: unknown }
    | null;
  const guess = typeof body?.guess === "string" ? body.guess : "";
  if (!guess) {
    return NextResponse.json({ error: "missing guess" }, { status: 400 });
  }

  const override = readDateOverride(req);
  if (override === "invalid") {
    return NextResponse.json({ error: "invalid date" }, { status: 404 });
  }

  const { chart } = await getToday(override ?? undefined);
  const correct = isGuessCorrect(guess, chart.songName);
  if (correct) {
    return NextResponse.json({ correct: true, reveal: buildReveal(chart) });
  }
  return NextResponse.json({ correct: false });
}
