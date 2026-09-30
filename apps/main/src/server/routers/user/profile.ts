import { db } from '@/lib/db';
import { user } from '@/lib/db/schema-pg';
import { getCurrentGame } from '@/lib/games/current';
import { isGameCnExclusive, isGameRegion } from '@/lib/games/frontend';
import { regionSchema } from '@/lib/games/schema';
import { protectedProcedure, router } from '@/lib/trpc';
import { Region, UserData } from '@/lib/types';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { fetchProfileSettings } from '@/server/queries/profile';
import { profileDescriptionInputSchema } from '@/lib/profile-description';

// Region choices are offered from the served game's regions, so they are validated against the same list.
function requireCurrentGameRegion(region: Region): void {
  const game = getCurrentGame();
  if (!isGameRegion(game, region)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `${region} is not enabled for ${game.brand.displayName}` });
  }
}

export const profileRouter = router({
  getUserData: protectedProcedure
    .query(async ({ ctx }) => {
      const cnOnly = isGameCnExclusive(getCurrentGame());
      const userRecord = await db
        .select({
          username: user.username, email: user.email, publishProfile: user.publishProfile, role: user.role,
          ...(!cnOnly ? { region: user.region } : {})
        })
        .from(user)
        .where(eq(user.id, ctx.session.user.id))
        .limit(1);

      if (userRecord.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return {
        hasUsername: !!userRecord[0].username,
        username: userRecord[0].username,
        email: userRecord[0].email,
        publishProfile: userRecord[0].publishProfile,
        region: (!cnOnly ? userRecord[0].region! : 'cn') as Region,
        role: userRecord[0].role,
      } satisfies UserData;
    }),

  getProfileSettings: protectedProcedure
    .query(async ({ ctx }) => {
      const settings = await fetchProfileSettings(ctx.session.user.id);
      if (!settings) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }
      return settings;
    }),

  updateProfileDescription: protectedProcedure
    .input(profileDescriptionInputSchema)
    .mutation(async ({ ctx, input }) => {
      await db
        .update(user)
        .set({
          profileDescription: input.profileDescription,
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.session.user.id));

      return { success: true };
    }),

  updatePublishProfile: protectedProcedure
    .input(z.object({
      publishProfile: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(user)
        .set({
          publishProfile: input.publishProfile,
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.session.user.id));

      return { success: true };
    }),

  updateRegion: protectedProcedure
    .input(z.object({
      region: regionSchema.nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.region !== null) requireCurrentGameRegion(input.region);
      await db
        .update(user)
        .set({
          region: input.region,
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.session.user.id));

      return { success: true };
    }),

  updateProfileMainRegion: protectedProcedure
    .input(z.object({
      profileMainRegion: regionSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      if (isGameCnExclusive(getCurrentGame())) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot update profile main region in China region' });
      requireCurrentGameRegion(input.profileMainRegion);
      await db
        .update(user)
        .set({
          profileMainRegion: input.profileMainRegion,
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.session.user.id));

      return { success: true };
    }),

  updateProfilePrivacySettings: protectedProcedure
    .input(z.object({
      profileShowAllScores: z.boolean(),
      profileShowScoreDetails: z.boolean(),
      profileShowPlates: z.boolean(),
      profileShowPlayCounts: z.boolean(),
      profileShowEvents: z.boolean(),
      profileShowInSearch: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(user)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.session.user.id));

      return { success: true };
    }),

  setAlbumPreference: protectedProcedure
    .input(z.object({
      fetchUseAlbums: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(user)
        .set({
          fetchUseAlbums: input.fetchUseAlbums,
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.session.user.id));

      return { success: true };
    }),
});
