import { NextRequest, NextResponse } from 'next/server';
import { renderRedirectUrl } from '@/lib/render-token';
import { buildLastCreditMessage } from '@/server/services/games/maimai/render/messages';
import { playsOwnerQuery, resolvePlaysOwner } from '@/server/services/games/images/plays-owner';
import { logger } from '@/lib/logger';
import { withRequestLogContext } from '@/lib/request-logger';
import { z } from 'zod';
import { requireFrontendGame } from '@/lib/games/current';

export const dynamic = "force-dynamic";

const searchParams = z.intersection(playsOwnerQuery, z.object({
  beforeDate: z.iso.datetime().optional(),
  at: z.coerce.number().int().positive().optional(),
}));

/**
 * Auth boundary for last-credit render. Resolves whose credit to show (a
 * published snapshot's owner or the signed-in user), then does the full data
 * prep here and mints a signed token carrying the credit tracks + header. 302s to render.
 */
export const GET = withRequestLogContext("last-credit", async (request: NextRequest) => {
  requireFrontendGame("maimai");
  const parsed = searchParams.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const owner = await resolvePlaysOwner("maimai", parsed.data, "last-credit");
  if (owner instanceof Response) return owner;
  if ("snapshotId" in parsed.data) logger.info({ userId: owner.userId, snapshotId: parsed.data.snapshotId }, 'Public mode');
  else logger.info({ userId: owner.userId }, 'Authenticated mode');

  const { beforeDate, at } = parsed.data;
  const result = await buildLastCreditMessage({
    userId: owner.userId,
    region: owner.region,
    beforeDate: beforeDate ? new Date(beforeDate) : undefined,
    startAt: at ? new Date(at * 1000) : undefined,
    scale: 2,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const url = renderRedirectUrl(request.nextUrl.searchParams, result.message);
  return NextResponse.redirect(url, 302);
});
