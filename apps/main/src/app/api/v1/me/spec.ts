import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { regionSchema } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/me",
  tag: "Account",
  summary: "Get the authenticated user's profile metadata",
  description:
    "Returns the username, primary region, profile visibility, and account " +
    "role for the user the token was issued to. The region is the user's " +
    "choice for the game of the site that answers the request.",
  scope: "user:metadata:read",
  cost: 1,
  response: z.object({
    username: z.string().nullable(),
    region: regionSchema
      .nullable()
      .describe("The region the dashboard opens with: the user's choice for this site's game, else the game's first enabled region. Null only while the game enables no region."),
    publishProfile: z.boolean().describe("Whether the user's profile is publicly visible."),
    role: z.string().nullable().describe("Account role: `user`, `admin`, etc."),
  }),
  examples: [
    {
      name: "Success",
      response: {
        username: "alice",
        region: "intl",
        publishProfile: true,
        role: "user",
      },
    },
  ],
});
