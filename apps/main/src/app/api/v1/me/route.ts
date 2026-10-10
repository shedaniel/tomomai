import { withApiKey } from "@/lib/api/protect";
import { zodJson } from "@/lib/api/zod-response";
import { getCurrentGame } from "@/lib/games/current";
import { getGameRegion } from "@/lib/games/frontend";
import { fetchUserData } from "@/server/queries/profile";
import { spec } from "./spec";

export const GET = withApiKey(spec, async (_req, key) => {
  const game = getCurrentGame();
  const userData = await fetchUserData(game.id, key.userId);
  if (!userData) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }
  return zodJson(spec.response, {
    username: userData.username,
    region: getGameRegion(game, userData.region),
    publishProfile: userData.publishProfile,
    role: userData.role,
  });
});
