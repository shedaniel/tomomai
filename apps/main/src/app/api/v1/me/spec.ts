import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { regionSchema } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/me",
  tag: "Account",
  summary: "Get the authenticated user's profile metadata",
  description:
    "Returns the username, profile picture, primary region, profile visibility, and account " +
    "role for the user the token was issued to.",
  scope: "user:metadata:read",
  cost: 1,
  response: z.object({
    username: z.string().nullable(),
    image: z.string().nullable().describe("Profile picture URL, or null when the user has none."),
    region: regionSchema.nullable().describe("Primary region, or null until the user picks one."),
    publishProfile: z.boolean().describe("Whether the user's profile is publicly visible."),
    role: z.string().nullable().describe("Account role: `user`, `admin`, etc."),
  }),
  examples: [
    {
      name: "Success",
      response: {
        username: "alice",
        image: "https://cdn.discordapp.com/avatars/123456789012345678/a1b2c3d4e5f6.png",
        region: "intl",
        publishProfile: true,
        role: "user",
      },
    },
  ],
});
