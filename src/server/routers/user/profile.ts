import { db } from '@/lib/db';
import { user } from '@/lib/db/schema-pg';
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { Region, UserData } from '@/lib/types';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getEnabledRegions, isCNExclusive } from '@/lib/enabled-regions';
import { resolvePublicUserByUsername } from '@/server/queries/public-access';

const regionSchema = z.enum(getEnabledRegions());

export const profileRouter = router({
  getUserData: protectedProcedure
    .query(async ({ ctx }) => {
      const userRecord = await db
        .select({
          username: user.username, publishProfile: user.publishProfile, role: user.role,
          ...(!isCNExclusive() ? { region: user.region } : {})
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
        publishProfile: userRecord[0].publishProfile,
        region: (!isCNExclusive() ? userRecord[0].region! : 'cn') as Region,
        role: userRecord[0].role,
      } satisfies UserData;
    }),

  getPublicProfile: publicProcedure
    .input(z.object({
      username: z.string(),
    }))
    .query(async ({ input }) => {
      return await resolvePublicUserByUsername(input.username);
    }),

  getProfileSettings: protectedProcedure
    .query(async ({ ctx }) => {
      const userRecord = await db
        .select({
          publishProfile: user.publishProfile,
          profileMainRegion: user.profileMainRegion,
          profileShowAllScores: user.profileShowAllScores,
          profileShowScoreDetails: user.profileShowScoreDetails,
          profileShowPlates: user.profileShowPlates,
          profileShowPlayCounts: user.profileShowPlayCounts,
          profileShowEvents: user.profileShowEvents,
          profileShowInSearch: user.profileShowInSearch,
          fetchUseAlbums: user.fetchUseAlbums,
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

      return userRecord[0];
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
      if (isCNExclusive()) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot update profile main region in China region' });
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
          profileShowAllScores: input.profileShowAllScores,
          profileShowScoreDetails: input.profileShowScoreDetails,
          profileShowPlates: input.profileShowPlates,
          profileShowPlayCounts: input.profileShowPlayCounts,
          profileShowEvents: input.profileShowEvents,
          profileShowInSearch: input.profileShowInSearch,
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
