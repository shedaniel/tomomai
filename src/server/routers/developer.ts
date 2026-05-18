import { auth } from "@/lib/auth";
import { API_SCOPES, expandScopes, type ScopeKey } from "@/lib/api/scopes";
import { protectedProcedure, router } from "@/lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apikey } from "@/lib/db/schema-pg";
import { and, eq } from "drizzle-orm";

const scopeKey = z.enum(Object.keys(API_SCOPES) as [ScopeKey, ...ScopeKey[]]);

export const developerRouter = router({
  rotateApiKey: protectedProcedure
    .input(z.object({ keyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify the key belongs to the current user and get its config
      const oldKey = await db.query.apikey.findFirst({
        where: and(eq(apikey.id, input.keyId), eq(apikey.userId, ctx.session.user.id)),
        columns: { name: true, permissions: true },
      });
      if (!oldKey) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Key not found" });
      }
      const permissions = oldKey.permissions
        ? (JSON.parse(oldKey.permissions) as Record<string, string[]>)
        : undefined;

      // Better Auth has no rotateApiKey — implement as delete + recreate
      await auth.api.deleteApiKey({
        body: { keyId: input.keyId },
      });

      const result = await auth.api.createApiKey({
        body: {
          userId: ctx.session.user.id,
          name: oldKey.name ?? undefined,
          permissions,
          expiresIn: null,
        },
      });

      if (!result?.key) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to rotate API key" });
      }

      return { key: result.key };
    }),

  createApiKey: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(64),
        scopes: z.array(scopeKey).min(1),
        expiresIn: z.number().positive().optional(), // seconds
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Expand any encompassing scopes to their leaf scopes before storing.
      // This keeps verifyApiKey simple (pure AND logic, single Better Auth call).
      const leafScopes = expandScopes(input.scopes);
      const permissions = Object.fromEntries(
        leafScopes.map((s) => [s, ["access"]])
      );

      // Call without headers so Better Auth treats this as a server-side call,
      // which allows setting permissions and userId directly.
      const result = await auth.api.createApiKey({
        body: {
          userId: ctx.session.user.id,
          name: input.name,
          expiresIn: input.expiresIn ?? null,
          permissions,
        },
      });

      if (!result) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create API key" });
      }

      return { key: result.key };
    }),
});
