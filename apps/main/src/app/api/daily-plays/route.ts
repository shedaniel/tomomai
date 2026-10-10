import { NextRequest, NextResponse } from 'next/server';
import { renderRedirectUrl } from '@/lib/render-token';
import { buildDailyPlaysMessage } from '@/server/services/games/maimai/render/messages';
import { playsOwnerQuery, resolvePlaysOwner } from '@/server/services/games/maimai/render/plays-owner';
import { requestLogger } from '@/lib/request-logger';
import { z } from 'zod';
import { requireFrontendGame } from '@/lib/games/current';

export const dynamic = "force-dynamic";

const searchParams = z.intersection(playsOwnerQuery, z.object({ day: z.iso.date().optional() }));

/**
 * Auth boundary for daily-plays render. Resolves whose plays to show (a
 * published snapshot's owner or the signed-in user), then does the full data
 * prep here and mints a signed token carrying the day's plays + header. 302s to render.
 */
export async function GET(request: NextRequest) {
  requireFrontendGame("maimai");
  const { log } = requestLogger(request, "daily-plays");
  const parsed = searchParams.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const owner = await resolvePlaysOwner(parsed.data, "daily-plays");
  if (owner instanceof Response) return owner;
  if ("snapshotId" in parsed.data) log.info({ userId: owner.userId, snapshotId: parsed.data.snapshotId }, 'Public mode');
  else log.info({ userId: owner.userId }, 'Authenticated mode');

  const result = await buildDailyPlaysMessage({
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
