import { withApiKey } from "@/lib/api/protect";
import { zodJson } from "@/lib/api/zod-response";
import { getCurrentGame } from "@/lib/games/current";
import { getGameRegion } from "@/lib/games/frontend";
import { fetchProfileSettings } from "@/server/queries/profile";
import { privacyFor } from "@/lib/profile-audience";
import { spec } from "./spec";

export const GET = withApiKey(spec, async (_req, key) => {
  const game = getCurrentGame();
  const settings = await fetchProfileSettings(game.id, key.userId);
  if (!settings) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }
  const publicView = privacyFor(settings, "public");
  return zodJson(spec.response, {
    publishProfile: settings.profileVisibility === "public",
    profileVisibility: settings.profileVisibility,
    profileMainRegion: getGameRegion(game, settings.profileMainRegion),
    profileShowAllScores: publicView.profileShowAllScores,
    profileShowScoreDetails: publicView.profileShowScoreDetails,
    profileShowPlates: publicView.profileShowPlates,
    profileShowPlayCounts: publicView.profileShowPlayCounts,
    profileShowEvents: publicView.profileShowEvents,
    profileShowInSearch: publicView.profileShowInSearch,
    profileAudiences: {
      allScores: settings.profileAllScoresAudience,
      scoreDetails: settings.profileScoreDetailsAudience,
      plates: settings.profilePlatesAudience,
      playCounts: settings.profilePlayCountsAudience,
      events: settings.profileEventsAudience,
    },
  });
});
