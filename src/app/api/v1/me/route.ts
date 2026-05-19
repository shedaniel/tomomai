import { withApiKey } from "@/lib/api/protect";
import { zodJson } from "@/lib/api/zod-response";
import { fetchUserData } from "@/server/queries/profile";
import { spec } from "./spec";

export const GET = withApiKey(["user:metadata:read"], async (_req, key) => {
  const userData = await fetchUserData(key.userId);
  if (!userData) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }
  return zodJson(spec.response, {
    username: userData.username,
    region: userData.region,
    publishProfile: userData.publishProfile,
    role: userData.role,
  });
});
