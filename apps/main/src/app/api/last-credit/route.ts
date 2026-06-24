import { getServerSession } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { user, userSnapshots } from '@/lib/db/schema-pg';
import { and, eq } from 'drizzle-orm';
import { renderRedirectUrl } from '@/lib/render-token';
import { requestLogger } from '@/lib/request-logger';
import { getEnabledRegions } from '@/lib/enabled-regions';
import { z } from 'zod';

export const dynamic = "force-dynamic";

const searchParams = z.object({
  region: z.enum(getEnabledRegions()),
  snapshotId: z.string().min(1).optional(),
  beforeDate: z.iso.datetime().optional(),
});

// Rendering moved to apps/render. This route stays the auth boundary: it resolves
// who the credit belongs to (public snapshot, or the signed-in user), then 302s
// to the render service with a token carrying the resolved userId.
export async function GET(request: NextRequest) {
  const { log } = requestLogger(request, "last-credit");
  const parsed = searchParams.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { region, snapshotId, beforeDate } = parsed.data;

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

  const url = renderRedirectUrl(request.nextUrl.searchParams, {
    route: 'last-credit',
    userId,
    region,
    beforeDate,
  });
  return NextResponse.redirect(url, 302);
}
