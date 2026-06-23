import { NextRequest, NextResponse } from 'next/server';
import type { Region } from '@/lib/types';
import { renderRedirectUrl } from '@/lib/render-token';
import { getEnabledRegions } from '@/lib/enabled-regions';
import { z } from 'zod';

export const dynamic = "force-dynamic";

const searchParams = z.object({
  snapshotId: z.string().min(1),
  username: z.string().optional(),
  region: z.enum(getEnabledRegions()).optional(),
});

// Rendering moved to apps/render. This route is the auth/capability boundary:
// access is possession of the unguessable snapshot publicId, so we just validate
// and 302 to the render service with a signed token. No session check (unchanged
// from the previous behaviour, which rendered for anyone holding the publicId).
export async function GET(request: NextRequest) {
  const parsed = searchParams.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { snapshotId, username, region } = parsed.data;

  const url = renderRedirectUrl(request.nextUrl.searchParams, {
    route: 'export-image',
    snapshotId,
    username,
    region: region as Region | undefined,
  });
  return NextResponse.redirect(url, 302);
}
