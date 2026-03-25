import { withApiKey } from "@/lib/api/protect";
import { fetchUserData } from "@/server/queries/profile";

export const GET = withApiKey(["user:metadata:read"], async (_req, key) => {
  const userData = await fetchUserData(key.userId);

  if (!userData) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json({
    username: userData.username,
    region: userData.region,
    publishProfile: userData.publishProfile,
    role: userData.role,
  });
});
