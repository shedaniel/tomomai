import { z } from "zod";
import { defineGameRoute } from "@/lib/api/registry";
import { querySchemas, successResponse } from "@/lib/api/schemas";
import { CLAL_VALUE } from "@/lib/games/token-format";

export const COOKIE_SIGN_IN_UNSUPPORTED = "COOKIE_SIGN_IN_UNSUPPORTED";

export const spec = defineGameRoute({
  method: "DELETE",
  path: "/api/v1/games/{game}/fetch/token",
  tag: "Fetch",
  summary: "Delete the stored upstream token",
  description:
    "Removes the caller's stored upstream authentication token for the " +
    "given region. After this, `POST /api/v1/games/{game}/fetch` will return `412` " +
    "until a new token is supplied in the app or with `PUT /api/v1/games/{game}/fetch/token`.",
  scope: "fetch:delete",
  capability: "scores",
  cost: 20,
  query: querySchemas.regionRequired,
  response: successResponse,
});

export const putBody = z.object({
  clal: z.string().regex(CLAL_VALUE, "Expected the 64-character value of the clal cookie")
    .describe("The value of the `clal` cookie the SEGA gateway sets after signing in."),
});

export const putSpec = defineGameRoute({
  method: "PUT",
  path: "/api/v1/games/{game}/fetch/token",
  tag: "Fetch",
  summary: "Save a SEGA cookie as the upstream token",
  description:
    "Stores a SEGA gateway session cookie as the caller's upstream token for the given region, " +
    "replacing the stored one. It is not checked against SEGA here. The next fetch signs in with it " +
    "and reports a token error if SEGA refuses it. Only regions that sign in with a SEGA cookie accept one.",
  scope: "fetch:token:write",
  capability: "scores",
  cost: 20,
  query: querySchemas.regionRequired,
  body: putBody,
  response: successResponse,
  errors: [{ status: 422, code: COOKIE_SIGN_IN_UNSUPPORTED, description: "The region does not sign in with a SEGA cookie." }],
});
