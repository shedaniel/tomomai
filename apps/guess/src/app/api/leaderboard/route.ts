import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@tomomai/security/rate-limit";
import { getPlayer } from "@/lib/accounts/session";
import { getRealTodayKey, isTodaySlug, parsePastDateSlug } from "@/lib/date-slug";
import { getLeaderboard } from "@/lib/leaderboard";
import { boardLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, boardLimiter);
  if (limited) return limited;

  const slug = req.nextUrl.searchParams.get("date");
  const dateKey = !slug || isTodaySlug(slug) ? getRealTodayKey() : parsePastDateSlug(slug);
  if (!dateKey) return NextResponse.json({ error: "invalid date" }, { status: 404 });

  const player = await getPlayer();
  const board = await getLeaderboard(dateKey, player?.id ?? null);
  if (!board) return NextResponse.json({ error: "leaderboard unavailable" }, { status: 503 });
  return NextResponse.json(board, { headers: { "Cache-Control": "private, no-store" } });
}
