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
    "role for the user the token was issued to.",
  scope: "user:metadata:read",
  response: z.object({
    username: z.string().nullable(),
    region: regionSchema,
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
