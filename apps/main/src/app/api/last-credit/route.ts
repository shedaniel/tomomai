import { NextRequest, NextResponse } from 'next/server';
import { renderRedirectUrl } from '@/lib/render-token';
import { buildLastCreditMessage } from '@/server/services/games/maimai/render/messages';
import { playsOwnerQuery, resolvePlaysOwner } from '@/server/services/games/maimai/render/plays-owner';
import { requestLogger } from '@/lib/request-logger';
import { z } from 'zod';
import { requireFrontendGame } from '@/lib/games/current';

export const dynamic = "force-dynamic";

const searchParams = z.intersection(playsOwnerQuery, z.object({ beforeDate: z.iso.datetime().optional() }));

/**
 * Auth boundary for last-credit render. Resolves whose credit to show (a
 * published snapshot's owner or the signed-in user), then does the full data
 * prep here and mints a signed token carrying the credit tracks + header. 302s to render.
 */
export async function GET(request: NextRequest) {
  requireFrontendGame("maimai");
  const { log } = requestLogger(request, "last-credit");
  const parsed = searchParams.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const owner = await resolvePlaysOwner(parsed.data, "image-export");
  if (owner instanceof Response) return owner;
  if ("snapshotId" in parsed.data) log.info({ userId: owner.userId, snapshotId: parsed.data.snapshotId }, 'Public mode');
  else log.info({ userId: owner.userId }, 'Authenticated mode');

  const { beforeDate } = parsed.data;
  const result = await buildLastCreditMessage({
    userId: owner.userId,
    region: owner.region,
    beforeDate: beforeDate ? new Date(beforeDate) : undefined,
    scale: 2,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const url = renderRedirectUrl(request.nextUrl.searchParams, result.message);
  return NextResponse.redirect(url, 302);
}
