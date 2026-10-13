import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getPlayer } from "@/lib/accounts/session";
import { getDb } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { loadViewer } from "@/lib/accounts/load-viewer";

export const runtime = "nodejs";

export async function GET() {
  const player = await getPlayer();
  return NextResponse.json(
    { viewer: player ? await loadViewer(player) : null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(req: NextRequest) {
  const player = await getPlayer();
  const db = getDb();
  if (!player || !db) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { showOnLeaderboard?: unknown } | null;
  if (typeof body?.showOnLeaderboard !== "boolean") {
    return NextResponse.json({ error: "showOnLeaderboard must be a boolean" }, { status: 400 });
  }
  const [updated] = await db
    .update(players)
    .set({ showOnLeaderboard: body.showOnLeaderboard })
    .where(eq(players.id, player.id))
    .returning();
  return NextResponse.json({ viewer: await loadViewer(updated ?? player) });
}
