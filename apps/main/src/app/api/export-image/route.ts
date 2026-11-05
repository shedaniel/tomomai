import { NextRequest, NextResponse } from 'next/server';
import { renderRedirectUrl } from '@/lib/render-token';
import { resolveGameContext } from '@/lib/games/access';
import { getCurrentGame } from '@/lib/games/current';
import { GameError, gameErrorResponse } from '@/lib/games/errors';
import { regionSchema } from '@/lib/games/schema';
import { GAME_SERVER_MODULES } from '@/server/services/games/registry';
import { z } from 'zod';

export const dynamic = "force-dynamic";

const searchParams = z.object({
  snapshotId: z.string().min(1),
  username: z.string().optional(),
  region: regionSchema.optional(),
});

/**
 * Auth/capability boundary for the served game's rating image. Access is possession of the
 * unguessable snapshot publicId (unchanged from the pre-token era).
 *
 * The game's image builder does the data prep (DB → RenderMessage) and the 302 carries the signed
 * token. apps/render verifies + renders with zero DB access, joining catalog fields from
 * /api/v1/games/{game}/songs.
 */
export async function GET(request: NextRequest) {
  const game = getCurrentGame().id;
  const parsed = searchParams.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { snapshotId, username, region } = parsed.data;
  try {
    resolveGameContext(game, { region, capability: "image-export" });
  } catch (error) {
    if (error instanceof GameError) return gameErrorResponse(error);
    throw error;
  }

  const result = await GAME_SERVER_MODULES[game].images.exportImage({
    snapshotId,
    username,
    region,
    scale: 2,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const url = renderRedirectUrl(request.nextUrl.searchParams, result.message);
  return NextResponse.redirect(url, 302);
}
