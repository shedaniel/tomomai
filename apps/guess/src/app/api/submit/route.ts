import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@tomomai/security/rate-limit";
import { submitLimiter } from "@/lib/rate-limit";
import { buildReveal, getToday } from "@/lib/today";
import { isGuessCorrect } from "@/lib/fuzzy";
import { readDateOverride } from "@/lib/route-date";
import { isTracked, recordAction, resolveOwner, toState } from "@/lib/attempts";

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

  const { dateKey, chart } = await getToday(override ?? undefined);
  const correct = isGuessCorrect(guess, chart.songName);

  let attempt = null;
  if (isTracked(dateKey)) {
    const owner = await resolveOwner(true);
    const row = owner ? await recordAction(owner, dateKey, correct ? "correct" : "incorrect") : null;
    attempt = row ? toState(row) : null;
  }

  if (correct) {
    return NextResponse.json({ correct: true, reveal: buildReveal(chart), attempt });
  }
  return NextResponse.json({ correct: false, attempt });
}
