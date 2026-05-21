import { NextResponse } from "next/server";
import { getSongSummaries } from "@/lib/song-pool";
import { searchSongs } from "@/lib/fuzzy";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const limit = Math.max(1, Math.min(20, Number(searchParams.get("limit") ?? 10)));
  if (!q.trim()) return NextResponse.json({ results: [] });
  const summaries = await getSongSummaries();
  return NextResponse.json({ results: searchSongs(summaries, q, limit) });
}
