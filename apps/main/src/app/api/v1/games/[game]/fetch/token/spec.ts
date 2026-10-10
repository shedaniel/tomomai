import { defineGameRoute } from "@/lib/api/registry";
import { querySchemas, successResponse } from "@/lib/api/schemas";

export const spec = defineGameRoute({
  method: "DELETE",
  path: "/api/v1/games/{game}/fetch/token",
  tag: "Fetch",
  summary: "Delete the stored upstream token",
  description:
    "Removes the caller's stored upstream authentication token for the " +
    "given region. After this, `POST /api/v1/games/{game}/fetch` will return `412` " +
    "until a new token is supplied via the in-app flow.",
  scope: "fetch:delete",
  capability: "scores",
  cost: 20,
  query: querySchemas.regionRequired,
  response: successResponse,
});
