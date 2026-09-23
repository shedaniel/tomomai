import { defineGameRoute as defineRoute } from "@/lib/api/registry";
import { querySchemas, successResponse } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "DELETE",
  path: "/api/v1/games/{game}/fetch/token",
  tag: "Fetch",
  summary: "Delete the stored upstream maimai token",
  description:
    "Removes the caller's stored maimai authentication token for the " +
    "given region. After this, `POST /api/v1/games/{game}/fetch` will return `412` " +
    "until a new token is supplied via the in-app flow.",
  scope: "fetch:delete",
  cost: 20,
  query: querySchemas.regionRequired,
  response: successResponse,
});
