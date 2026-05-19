import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/me/scopes",
  tag: "Account",
  summary: "List the scopes the current token holds",
  description:
    "Returns every scope key the calling token has access to. Useful when " +
    "your app stores the token long-term and wants to refresh its capability " +
    "list without re-running the OAuth flow.",
  scope: "ready",
  response: z.object({
    scopes: z.array(z.string()).describe("Array of scope keys, e.g. `recent:read`."),
  }),
  examples: [
    {
      name: "API key with broad access",
      response: {
        scopes: [
          "ready",
          "user:metadata:read",
          "snapshot:all:metadata:read",
          "snapshot:all:songs:read",
          "recent:read",
        ],
      },
    },
  ],
});
