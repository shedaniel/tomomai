import "server-only";
import { NextResponse } from "next/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth-server";
import { resolveGameContext } from "@/lib/games/access";
import { GameError, gameErrorResponse } from "@/lib/games/errors";
import { regionSchema } from "@/lib/games/schema";
import type { GameCapability } from "@/lib/games/types";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { resolveOwnSnapshotRegion, resolvePublicSnapshotAccess } from "@/server/queries/public-access";

/** A visitor names a published snapshot, the signed-in owner names a region. */
export const playsOwnerQuery = z.union([
  z.object({ snapshotId: z.string().min(1) }),
  z.object({ region: regionSchema }),
]);

/**
 * Whose recent plays an image of the game shows. A visitor sees the snapshot owner's plays in the snapshot's
 * own region, and only when the owner shares recent plays. The owner always sees their own snapshot's plays.
 * Refusals come back as the response to send.
 */
export async function resolvePlaysOwner(
  game: CanonicalGameId,
  query: z.infer<typeof playsOwnerQuery>,
  capability: GameCapability,
): Promise<{ userId: string; region: Region } | Response> {
  try {
    const session = await getServerSession();
    const viewerId = session?.user?.id;
    if ("snapshotId" in query) {
      const ownRegion = viewerId ? await resolveOwnSnapshotRegion(game, query.snapshotId, viewerId) : null;
      if (viewerId && ownRegion) {
        resolveGameContext(game, { region: ownRegion, capability });
        return { userId: viewerId, region: ownRegion };
      }
      const { userId, region } = await resolvePublicSnapshotAccess(game, query.snapshotId, { capability, view: "recentPlays" });
      return { userId, region };
    }
    const { region } = resolveGameContext(game, { region: query.region, capability });
    if (!viewerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return { userId: viewerId, region };
  } catch (error) {
    if (error instanceof GameError) return gameErrorResponse(error);
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      return NextResponse.json({ error: "Snapshot not found or not public" }, { status: 404 });
    }
    throw error;
  }
}
