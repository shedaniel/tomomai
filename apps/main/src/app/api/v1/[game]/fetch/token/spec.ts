import { defineRoute } from "@/lib/api/registry";
import { paramSchemas, querySchemas, successResponse } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "DELETE",
  path: "/api/v1/{game}/fetch/token",
  tag: "maimai · Fetch",
  summary: "Delete the stored upstream maimai token",
  description:
    "Removes the caller's stored maimai authentication token for the " +
    "given region. After this, `POST /api/v1/{game}/fetch` will return `412` " +
    "until a new token is supplied via the in-app flow.",
  scope: "fetch:delete",
  cost: 20,
  params: paramSchemas.game,
  query: querySchemas.regionRequired,
  response: successResponse,
});
