import { db } from '@/lib/db';
import { user } from '@/lib/db/schema-pg';
import { FLAG_CATEGORY_ORDER, FlagCategory, Flags, flagDefinitions } from '@/lib/flags';
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

export const flagsRouter = router({
  getUserSelectableFlags: publicProcedure.query(async ({ ctx }) => {
    const selectableFlags: Record<string, { key: string; defaultValue: boolean; userSelectable: boolean; category: FlagCategory }> = {};
    for (const [key, def] of Object.entries(flagDefinitions)) {
      if (def.userSelectable) {
        selectableFlags[key] = {
          key: def.key,
          defaultValue: def.defaultValue,
          userSelectable: def.userSelectable,
          category: def.category,
        };
      }
    }

    const userId = ctx.session?.user?.id ?? null;
    let currentOverrides: Partial<Flags> = {};
    if (userId) {
      const row = await db.query.user.findFirst({
        where: eq(user.id, userId),
        columns: { flagOverrides: true },
      });
      currentOverrides = (row?.flagOverrides as Partial<Flags> | null) ?? {};
    }

    return {
      flags: selectableFlags,
      categoryOrder: FLAG_CATEGORY_ORDER,
      currentOverrides,
      authenticated: !!userId,
    };
  }),

  setFlagOverrides: protectedProcedure
    .input(z.object({
      overrides: z.record(z.string(), z.boolean()),
    }))
    .mutation(async ({ ctx, input }) => {
      const sanitized: Partial<Flags> = {};
      for (const [key, value] of Object.entries(input.overrides)) {
        const def = flagDefinitions[key as keyof Flags];
        if (!def) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown flag: ${key}` });
        }
        if (!def.userSelectable) {
          throw new TRPCError({ code: 'FORBIDDEN', message: `Flag is not user-selectable: ${key}` });
        }
        sanitized[key as keyof Flags] = value;
      }

      const stored = Object.keys(sanitized).length === 0 ? null : sanitized;
      await db
        .update(user)
        .set({ flagOverrides: stored as Record<string, boolean> | null })
        .where(eq(user.id, ctx.session.user.id));

      return { ok: true, currentOverrides: sanitized };
    }),
});
