import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { regionSchema } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/me",
  tag: "Account",
  summary: "Get the authenticated user's profile metadata",
  description:
    "Returns the account ID, username, profile picture, primary region, profile visibility, " +
    "and account role for the user the token was issued to. Use `id` to recognise a returning " +
    "user, since usernames can change or be unset. The region is the user's choice for the " +
    "game of the site that answers the request.",
  scope: "user:metadata:read",
  cost: 1,
  response: z.object({
    id: z.string().describe("Stable account ID. Never changes and is never reused."),
    username: z.string().nullable(),
    image: z.string().nullable().describe("Profile picture URL, or null when the user has none."),
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
        id: "Bx7qK2mZp9TfL4wNcR8vYd3s",
        username: "alice",
        image: "https://cdn.discordapp.com/avatars/123456789012345678/a1b2c3d4e5f6.png",
        region: "intl",
        publishProfile: true,
        role: "user",
      },
    },
  ],
});
