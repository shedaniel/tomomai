import { getServerSession } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { user, userSnapshots } from '@/lib/db/schema-pg';
import { and, eq } from 'drizzle-orm';
import { renderRedirectUrl } from '@/lib/render-token';
import { buildDailyPlaysMessage } from '@/lib/render-data';
import { requestLogger } from '@/lib/request-logger';
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
export async function GET(request: NextRequest) {
  const { log } = requestLogger(request, "daily-plays");
  const parsed = searchParams.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { region, snapshotId, day } = parsed.data;

  let userId: string;
  if (snapshotId) {
    const snapshot = await db
      .select({ userId: userSnapshots.userId })
      .from(userSnapshots)
      .innerJoin(user, eq(userSnapshots.userId, user.id))
      .where(and(eq(userSnapshots.publicId, snapshotId), eq(user.publishProfile, true)))
      .limit(1);
    if (snapshot.length === 0) {
      return NextResponse.json({ error: 'Snapshot not found or not public' }, { status: 404 });
    }
    userId = snapshot[0].userId;
    log.info({ userId, snapshotId }, 'Public mode');
  } else {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = session.user.id;
    log.info({ userId }, 'Authenticated mode');
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
}
