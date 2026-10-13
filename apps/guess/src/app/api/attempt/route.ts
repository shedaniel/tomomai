import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@tomomai/security/rate-limit";
import { getAttempt, isTracked, openAttempt, parseResults, resolveOwner, toState } from "@/lib/attempts";
import { submitLimiter } from "@/lib/rate-limit";
import { readPlayDateKey } from "@/lib/route-date";

export const runtime = "nodejs";

/**
 * Syncs the browser with the server's record for this puzzle. Signed-in
 * players get a row on first visit (so solve time counts from page load),
 * guests only once they have progress worth keeping.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, submitLimiter);
  if (limited) return limited;

  const dateKey = readPlayDateKey(req);
  if (dateKey === "invalid") return NextResponse.json({ error: "invalid date" }, { status: 404 });
  if (!isTracked(dateKey)) return NextResponse.json({ attempt: null });

  const body = (await req.json().catch(() => null)) as { results?: unknown } | null;
  const parsed = parseResults(body?.results ?? []);
  if (!parsed) return NextResponse.json({ error: "invalid results" }, { status: 400 });
  // A win only counts when the guess goes through /api/submit, so local wins are never imported.
  const localWin = parsed.includes("correct");
  const seed = localWin ? [] : parsed;

  const owner = await resolveOwner(seed.length > 0);
  if (!owner) return NextResponse.json({ attempt: null });

  const row =
    !localWin && ("playerId" in owner || seed.length > 0)
      ? await openAttempt(owner, dateKey, seed)
      : await getAttempt(owner, dateKey);
  return NextResponse.json({ attempt: row ? toState(row) : null });
}
