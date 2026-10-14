import { NextRequest, NextResponse } from 'next/server';
import { renderRedirectUrl } from '@/lib/render-token';
import { getCurrentGame } from '@/lib/games/current';
import { playsOwnerQuery, resolvePlaysOwner } from '@/server/services/games/images/plays-owner';
import { GAME_SERVER_MODULES } from '@/server/services/games/registry';
import { requestLogger } from '@/lib/request-logger';
import { z } from 'zod';

export const dynamic = "force-dynamic";

const searchParams = z.intersection(playsOwnerQuery, z.object({ day: z.iso.date().optional() }));

/**
 * Auth boundary for the served game's daily-plays image. Resolves whose plays to show (a
 * published snapshot's owner or the signed-in user), then the game's image builder does the data
 * prep and mints a signed token carrying the day's plays + header. 302s to render.
 */
export async function GET(request: NextRequest) {
  const game = getCurrentGame().id;
  const { log } = requestLogger(request, "daily-plays");
  const parsed = searchParams.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const owner = await resolvePlaysOwner(game, parsed.data, "daily-plays");
  if (owner instanceof Response) return owner;
  if ("snapshotId" in parsed.data) log.info({ userId: owner.userId, snapshotId: parsed.data.snapshotId }, 'Public mode');
  else log.info({ userId: owner.userId }, 'Authenticated mode');

  const result = await GAME_SERVER_MODULES[game].images.dailyPlays({
    userId: owner.userId,
    region: owner.region,
    day: parsed.data.day,
    scale: 2,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const url = renderRedirectUrl(request.nextUrl.searchParams, result.message);
  return NextResponse.redirect(url, 302);
}
