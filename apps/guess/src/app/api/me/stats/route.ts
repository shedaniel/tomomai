import { NextResponse } from "next/server";
import { getPlayer } from "@/lib/accounts/session";
import { getPlayerStats } from "@/lib/leaderboard";

export const runtime = "nodejs";

export async function GET() {
  const player = await getPlayer();
  if (!player) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const stats = await getPlayerStats(player.id);
  if (!stats) return NextResponse.json({ error: "stats unavailable" }, { status: 503 });
  return NextResponse.json(stats, { headers: { "Cache-Control": "private, no-store" } });
}
