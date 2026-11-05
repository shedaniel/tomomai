import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/lib/db";
import { user as userTable } from "@/lib/db/schema-pg";
import { logger } from "@/lib/logger";
import { DEV_REAUTH_PATH } from "@/lib/dev-reauth-path";

export const DEV_ANONYMOUS_SIGN_IN_PATH = "/dev/sign-in-anonymous";
const DEV_SIGN_IN_AS_PATH = "/dev/sign-in-as";

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
      devSignInAs: createAuthEndpoint(
        DEV_SIGN_IN_AS_PATH,
        { method: "POST", body: z.object({ username: z.string().trim().min(1) }) },
        async (ctx) => {
          if (process.env.NODE_ENV !== "development") {
            throw new APIError("NOT_FOUND", { message: "Not Found" });
          }

          const username = ctx.body.username.replace(/^@/, "");
          const [row] = await db
            .select({ id: userTable.id })
            .from(userTable)
            .where(sql`lower(${userTable.username}) = lower(${username})`)
            .limit(1);
          const user = row && (await ctx.context.internalAdapter.findUserById(row.id));
          if (!user) {
            throw new APIError("NOT_FOUND", { message: `No user @${username}` });
          }

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", { message: "Failed to create session" });
          }

          await setSessionCookie(ctx, { session, user });
          logger.info({ userId: user.id }, "auth.dev-sign-in-as");
          return ctx.json({ userId: user.id });
        },
      ),
      // Fresh-session gates otherwise lock out dev accounts, which have no provider or passkey to reauth with.
      devReauth: createAuthEndpoint(
        DEV_REAUTH_PATH,
        { method: "POST", use: [sessionMiddleware] },
        async (ctx) => {
          if (process.env.NODE_ENV !== "development") {
            throw new APIError("NOT_FOUND", { message: "Not Found" });
          }
          const { session: old, user } = ctx.context.session;
          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", { message: "Failed to create session" });
          }
          await setSessionCookie(ctx, { session, user });
          await ctx.context.internalAdapter.deleteSession(old.token);
          logger.info({ userId: user.id }, "auth.dev-reauth");
          return ctx.json({ userId: user.id });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
