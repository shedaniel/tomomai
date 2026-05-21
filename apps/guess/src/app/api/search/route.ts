import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@tomomai/security/rate-limit";
import { searchLimiter } from "@/lib/rate-limit";
import { getSongSummaries } from "@/lib/song-pool";
import { searchSongs } from "@/lib/fuzzy";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, searchLimiter);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const limit = Math.max(1, Math.min(20, Number(searchParams.get("limit") ?? 10)));
  if (!q.trim()) return NextResponse.json({ results: [] });
  const summaries = await getSongSummaries();
  return NextResponse.json({ results: searchSongs(summaries, q, limit) });
}
