import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { getServerSession } from "@/lib/auth-server";
import { getCurrentGame, requireFrontendGame } from "@/lib/games/current";
import { isGameRegion } from "@/lib/games/frontend";
import { resolveGameContext } from "@/lib/games/access";
import { fetchPublicGameProfile } from "@/server/queries/game-profile";
import { resolveUserByUsernameForViewer } from "@/server/queries/public-access";
import { fetchLatestSnapshotData } from "@/server/queries/snapshots";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import { safeDecodeURIComponent } from "@/lib/utils";
import { netBasePath } from "./routes";

/**
 * The player a /net page shows, or a 404. Visitors see the published profile through the public rules. The
 * owner always sees their own NET with every score, published or not, like the dashboard.
 * Pages and the layout call this with the same arguments and React dedupes the fetch within the request.
 */
export const loadNetPlayer = cache(async (rawUsername: string, region: string) => {
  requireFrontendGame("maimai");
  const game = getCurrentGame();
  if (!isGameRegion(game, region)) notFound();
  const username = safeDecodeURIComponent(rawUsername);
  const base = netBasePath(username, region);
  try {
    const session = await getServerSession();
    resolveGameContext(game.id, { region, capability: "scores" });
    const profile = await resolveUserByUsernameForViewer(game.id, username, session?.user.id);
    if (session?.user.id === profile.id) {
      const snapshotData = await GAME_SERVER_MODULES[game.id].reserved?.snapshot(username, region)
        ?? await fetchLatestSnapshotData(game.id, profile.id, region);
      return { game, profile, snapshotData, username, region, base, isOwner: true };
    }
    const { snapshotData } = await fetchPublicGameProfile(game.id, username, region);
    return { game, profile, snapshotData, username, region, base, isOwner: false };
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
});

export type NetPlayer = Awaited<ReturnType<typeof loadNetPlayer>>;

export type NetPageParams = { params: Promise<{ locale: string; username: string; region: string }> };
