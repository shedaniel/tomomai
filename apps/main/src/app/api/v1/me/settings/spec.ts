import { defineRoute } from "@/lib/api/registry";
import { profileSettings } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/me/settings",
  tag: "Account",
  summary: "Get the authenticated user's privacy and profile-display settings",
  description:
    "Returns the user's privacy and display preferences (publish profile, " +
    "show scores, show plates, etc.). Does **not** include fetch-pipeline " +
    "preferences such as `fetchUseAlbums`.",
  scope: "user:settings:read",
  cost: 2,
  response: profileSettings,
});
