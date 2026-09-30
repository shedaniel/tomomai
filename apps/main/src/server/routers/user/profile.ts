import { db } from '@/lib/db';
import { user } from '@/lib/db/schema-pg';
import { getCurrentGame } from '@/lib/games/current';
import { isGameCnExclusive, isGameRegion, type FrontendGame } from '@/lib/games/frontend';
import { regionSchema } from '@/lib/games/schema';
import { protectedProcedure, router } from '@/lib/trpc';
import { Region, UserData } from '@/lib/types';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { fetchProfileSettings, fetchUserData } from '@/server/queries/profile';
import { saveGamePreference } from '@/server/queries/game-preferences';
import { profileDescriptionInputSchema } from '@/lib/profile-description';

// Region choices are offered from the served game's regions, so they are validated against the same list.
function requireGameRegion(game: FrontendGame, region: Region): void {
  if (!isGameRegion(game, region)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `${region} is not enabled for ${game.brand.displayName}` });
  }
}

export const profileRouter = router({
  getUserData: protectedProcedure
    .query(async ({ ctx }) => {
      const userData = await fetchUserData(getCurrentGame().id, ctx.session.user.id);
      if (!userData) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return { hasUsername: !!userData.username, ...userData } satisfies UserData;
    }),

  getProfileSettings: protectedProcedure
    .query(async ({ ctx }) => {
      const settings = await fetchProfileSettings(getCurrentGame().id, ctx.session.user.id);
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
      region: regionSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const game = getCurrentGame();
      requireGameRegion(game, input.region);
      await saveGamePreference(game.id, ctx.session.user.id, { region: input.region });

      return { success: true };
    }),

  updateProfileMainRegion: protectedProcedure
    .input(z.object({
      profileMainRegion: regionSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const game = getCurrentGame();
      if (isGameCnExclusive(game)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot update profile main region in China region' });
      requireGameRegion(game, input.profileMainRegion);
      await saveGamePreference(game.id, ctx.session.user.id, { profileMainRegion: input.profileMainRegion });

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
