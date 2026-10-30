import { getServerSession } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { resolvePlayHistoryOwner } from '@/server/queries/public-access';
import { renderRedirectUrl } from '@/lib/render-token';
import { buildDailyPlaysMessage } from '@/lib/render-data';
import { logger } from '@/lib/logger';
import { withRequestLogContext } from '@/lib/request-logger';
import { getEnabledRegions } from '@/lib/enabled-regions';
import { z } from 'zod';

export const dynamic = "force-dynamic";

const searchParams = z.object({
  region: z.enum(getEnabledRegions()),
  snapshotId: z.string().min(1).optional(),
  day: z.iso.date().optional(),
});

/**
 * Auth boundary for daily-plays render. Resolves who the plays belong to
 * (public snapshot or signed-in user), then does the full data prep here and
 * mints a signed token carrying the day's plays + header. 302s to render.
 */
export const GET = withRequestLogContext("daily-plays", async (request: NextRequest) => {
  const parsed = searchParams.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { region, snapshotId, day } = parsed.data;

  const session = await getServerSession();
  let userId: string;
  if (snapshotId) {
    const ownerId = await resolvePlayHistoryOwner(snapshotId, session?.user?.id);
    if (!ownerId) {
      return NextResponse.json({ error: 'Snapshot not found or not public' }, { status: 404 });
    }
    userId = ownerId;
    logger.info({ userId, snapshotId }, 'Public mode');
  } else {
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = session.user.id;
    logger.info({ userId }, 'Authenticated mode');
  }

  const result = await buildDailyPlaysMessage({
    userId,
    region,
    day,
    scale: 2,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const url = renderRedirectUrl(request.nextUrl.searchParams, result.message);
  return NextResponse.redirect(url, 302);
});
