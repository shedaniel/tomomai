import { db } from '@/lib/db';
import { user } from '@/lib/db/schema-pg';
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { Region, UserData } from '@/lib/types';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getEnabledRegions, isCNExclusive } from '@/lib/enabled-regions';
import { resolvePublicUserByUsername } from '@/server/queries/public-access';
import { fetchProfileSettings } from '@/server/queries/profile';
import { revalidatePublicProfile, revalidatePublicProfileForUser } from '@/lib/profile-cache';
import {
  profileDescriptionMutationInputSchema,
  validateProfileDescriptionInput,
} from '@/lib/profile-description';

const regionSchema = z.enum(getEnabledRegions());

export const profileRouter = router({
  getUserData: protectedProcedure
    .query(async ({ ctx }) => {
      const userRecord = await db
        .select({
          username: user.username, email: user.email, publishProfile: user.publishProfile, role: user.role,
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
        email: userRecord[0].email,
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
    .input(profileDescriptionMutationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const parsed = validateProfileDescriptionInput(input);
      if (!parsed.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: parsed.error.issues[0]?.message ?? 'Invalid profile description',
        });
      }

      await db
        .update(user)
        .set({
          profileDescription: parsed.data.profileDescription,
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.session.user.id));

      await revalidatePublicProfileForUser(ctx.session.user.id);
      return { success: true };
    }),

  updatePublishProfile: protectedProcedure
    .input(z.object({
      publishProfile: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [current] = await db
        .select({ username: user.username, publishProfile: user.publishProfile })
        .from(user)
        .where(eq(user.id, ctx.session.user.id))
        .limit(1);

      if (!current) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }
      if (current.publishProfile === input.publishProfile) return { success: true };

      await db
        .update(user)
        .set({
          publishProfile: input.publishProfile,
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.session.user.id));

      revalidatePublicProfile([current.username]);
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
      const [current] = await db
        .select({ username: user.username, profileMainRegion: user.profileMainRegion })
        .from(user)
        .where(eq(user.id, ctx.session.user.id))
        .limit(1);

      if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      if (current.profileMainRegion === input.profileMainRegion) return { success: true };

      await db
        .update(user)
        .set({
          profileMainRegion: input.profileMainRegion,
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.session.user.id));

      revalidatePublicProfile([current.username]);
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
      const [current] = await db
        .select({
          username: user.username,
          profileShowAllScores: user.profileShowAllScores,
          profileShowScoreDetails: user.profileShowScoreDetails,
          profileShowPlates: user.profileShowPlates,
          profileShowPlayCounts: user.profileShowPlayCounts,
          profileShowEvents: user.profileShowEvents,
          profileShowInSearch: user.profileShowInSearch,
        })
        .from(user)
        .where(eq(user.id, ctx.session.user.id))
        .limit(1);

      if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      const changed = Object.entries(input).some(
        ([field, next]) => current[field as keyof typeof input] !== next,
      );
      if (!changed) return { success: true };

      await db
        .update(user)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.session.user.id));

      revalidatePublicProfile([current.username]);
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
