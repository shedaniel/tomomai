import { withApiKey } from "@/lib/api/protect";
import { zodJson } from "@/lib/api/zod-response";
import { fetchProfileSettings } from "@/server/queries/profile";
import { spec } from "./spec";

export const GET = withApiKey(["user:settings:read"], async (_req, key) => {
  const settings = await fetchProfileSettings(key.userId);
  if (!settings) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }
  return zodJson(spec.response, {
    publishProfile: settings.publishProfile,
    profileMainRegion: settings.profileMainRegion,
    profileShowAllScores: settings.profileShowAllScores,
    profileShowScoreDetails: settings.profileShowScoreDetails,
    profileShowPlates: settings.profileShowPlates,
    profileShowPlayCounts: settings.profileShowPlayCounts,
    profileShowEvents: settings.profileShowEvents,
    profileShowInSearch: settings.profileShowInSearch,
  });
});
