import { NextRequest, NextResponse } from 'next/server';
import { renderRedirectUrl } from '@/lib/render-token';
import { buildExportImageMessage } from '@/server/services/games/maimai/render/messages';
import { gameErrorResponse } from '@/lib/api/game-context';
import { resolveGameContext } from '@/lib/games/registry';
import { regionSchema } from '@/lib/games/schema';
import { z } from 'zod';

export const dynamic = "force-dynamic";

const searchParams = z.object({
  snapshotId: z.string().min(1),
  username: z.string().optional(),
  region: regionSchema.optional(),
});

/**
 * Auth/capability boundary for the export-image render. Access is possession
 * of the unguessable snapshot publicId (unchanged from the pre-token era).
 *
 * Now does the full data prep here (DB → RenderMessage) and mints a signed
 * token carrying the B50 scores + header metadata. The 302 carries the token;
 * apps/render verifies + renders with zero DB access. Catalog fields (song
 * names, covers, levels) are joined from /api/v1/games/maimai/songs on the render side.
 */
export async function GET(request: NextRequest) {
  const parsed = searchParams.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { snapshotId, username, region } = parsed.data;
  if (region) {
    try {
      resolveGameContext("maimai", region, "rating");
    } catch (error) {
      return gameErrorResponse(error);
    }
  }

  const result = await buildExportImageMessage({
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
