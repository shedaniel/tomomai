import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { nanoid } from "nanoid";
import { logger } from "@/lib/logger";

export const DEV_ANONYMOUS_SIGN_IN_PATH = "/dev/sign-in-anonymous";

// Throwaway accounts for local testing without Discord/Twitter OAuth. Only
// registered when NODE_ENV=development, so the route does not exist elsewhere.
export const devAnonymousAuth = () =>
  ({
    id: "dev-anonymous",
    endpoints: {
      devSignInAnonymous: createAuthEndpoint(
        DEV_ANONYMOUS_SIGN_IN_PATH,
        { method: "POST" },
        async (ctx) => {
          if (process.env.NODE_ENV !== "development") {
            throw new APIError("NOT_FOUND", { message: "Not Found" });
          }

          const id = nanoid(8).toLowerCase();
          const now = new Date();
          const user = await ctx.context.internalAdapter.createUser({
            name: `Anonymous ${id}`,
            email: `anon-${id}@dev.local`,
            emailVerified: false,
            createdAt: now,
            updatedAt: now,
          });
          if (!user) {
            throw new APIError("INTERNAL_SERVER_ERROR", { message: "Failed to create user" });
          }

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", { message: "Failed to create session" });
          }

          await setSessionCookie(ctx, { session, user });
          logger.info({ userId: user.id }, "auth.dev-anonymous.signin");
          return ctx.json({ userId: user.id });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
