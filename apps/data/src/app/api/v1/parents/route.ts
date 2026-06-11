import { db } from "@/lib/db";
import { parentSong } from "@/lib/db/schema";
import { NextResponse } from "next/server";

export const revalidate = 300;

// Public read API: all parent charts. Charts are identified by their public
// nanoid (songId) — internal integer ids never leave the service.
export async function GET() {
  const rows = await db.select().from(parentSong);

  const parents = rows.map(p => ({
    songId: p.publicId,
    songName: p.songName,
    artist: p.artist,
    genre: p.genre,
    cover: p.cover,
    bpm: p.bpm,
    type: p.type,
    difficulty: p.difficulty,
    disambiguator: p.disambiguator,
  }));

  return NextResponse.json(
    { parents },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
