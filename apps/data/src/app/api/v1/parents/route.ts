import { db } from "@/lib/db";
import { parentSong } from "@/lib/db/schema";
import type { ArtifactParentSong } from "@tomomai/catalog/artifact";
import { NextResponse } from "next/server";

export const revalidate = 300;

// Public read API: all parent charts, shaped like the catalog artifact rows.
export async function GET() {
  const rows = await db.select().from(parentSong);

  const parents: ArtifactParentSong[] = rows.map(p => ({
    id: Number(p.id),
    publicId: p.publicId,
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
