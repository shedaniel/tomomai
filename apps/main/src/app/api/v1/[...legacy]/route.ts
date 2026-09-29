import type { NextRequest } from "next/server";
import type { CanonicalGameId } from "@/lib/games/ids";

const API_ROOT = "/api/v1";
/** Every game path under /api/v1 served maimai before the API moved under /api/v1/games/{game}. */
const LEGACY_GAME: CanonicalGameId = "maimai";
const MOVED_ROOTS = new Set(["songs", "parents", "snapshots", "recents", "stats", "albums", "plates", "fetch"]);

type LegacyContext = { params: Promise<{ legacy: string[] }> };

/** Answers a path no route serves: 410 with the new location for a moved game path, 404 otherwise. */
async function answer(req: NextRequest, { params }: LegacyContext): Promise<Response> {
  const { legacy } = await params;
  if (!MOVED_ROOTS.has(legacy[0])) return Response.json({ error: "Not found" }, { status: 404 });
  const location = `${API_ROOT}/games/${LEGACY_GAME}${req.nextUrl.pathname.slice(API_ROOT.length)}${req.nextUrl.search}`;
  return Response.json({ error: `This endpoint moved to ${location}`, code: "MOVED", location }, { status: 410 });
}

export const GET = answer;
export const POST = answer;
export const PUT = answer;
export const PATCH = answer;
export const DELETE = answer;
