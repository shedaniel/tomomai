import { withApiKey } from "@/lib/api/protect";
import { zodJson } from "@/lib/api/zod-response";
import { getCurrentGame } from "@/lib/games/current";
import { getGameRegion } from "@/lib/games/frontend";
import { fetchProfileSettings } from "@/server/queries/profile";
import { spec } from "./spec";

export const GET = withApiKey(spec, async (_req, key) => {
  const game = getCurrentGame();
  const settings = await fetchProfileSettings(game.id, key.userId);
  if (!settings) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }
  return zodJson(spec.response, {
    publishProfile: settings.publishProfile,
    profileMainRegion: getGameRegion(game, settings.profileMainRegion),
    profileShowAllScores: settings.profileShowAllScores,
    profileShowScoreDetails: settings.profileShowScoreDetails,
    profileShowPlates: settings.profileShowPlates,
    profileShowPlayCounts: settings.profileShowPlayCounts,
    profileShowEvents: settings.profileShowEvents,
    profileShowInSearch: settings.profileShowInSearch,
  });
});
