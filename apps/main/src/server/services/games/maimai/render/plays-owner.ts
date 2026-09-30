import "server-only";
import { NextResponse } from "next/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth-server";
import { resolveGameContext } from "@/lib/games/access";
import { GameError, gameErrorResponse } from "@/lib/games/errors";
import { regionSchema } from "@/lib/games/schema";
import type { GameCapability } from "@/lib/games/types";
import type { Region } from "@/lib/games/ids";
import { resolvePublicSnapshotAccess } from "@/server/queries/public-access";

/** A visitor names a published snapshot, the signed-in owner names a region. */
export const playsOwnerQuery = z.union([
  z.object({ snapshotId: z.string().min(1) }),
  z.object({ region: regionSchema }),
]);

/**
 * Whose recent plays an image shows. A visitor sees the snapshot owner's plays in the snapshot's own
 * region, and only when the owner shares recent plays. Refusals come back as the response to send.
 */
export async function resolvePlaysOwner(
  query: z.infer<typeof playsOwnerQuery>,
  capability: GameCapability,
): Promise<{ userId: string; region: Region } | Response> {
  try {
    if ("snapshotId" in query) {
      const { userId, region } = await resolvePublicSnapshotAccess("maimai", query.snapshotId, { capability, view: "recentPlays" });
      return { userId, region };
    }
    const { region } = resolveGameContext("maimai", { region: query.region, capability });
    const session = await getServerSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return { userId: session.user.id, region };
  } catch (error) {
    if (error instanceof GameError) return gameErrorResponse(error);
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      return NextResponse.json({ error: "Snapshot not found or not public" }, { status: 404 });
    }
    throw error;
  }
}
