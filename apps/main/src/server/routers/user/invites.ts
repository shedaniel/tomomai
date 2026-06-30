import { db } from '@/lib/db';
import { invites, user } from '@/lib/db/schema-pg';
import { getLogger } from '@/lib/request-logger';
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { and, count, eq, isNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';

const SIGNUP_REQUIRED_AMOUNT = 256;

export const invitesRouter = router({
  getSignupRequirements: publicProcedure
    .query(async () => {
      const SIGNUP_TYPE = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE || 'disabled';

      if (SIGNUP_TYPE === 'disabled') {
        return {
          signupEnabled: false,
          inviteRequired: false,
          reason: 'disabled'
        };
      }

      if (SIGNUP_TYPE === 'enabled') {
        return {
          signupEnabled: true,
          inviteRequired: false,
          reason: 'enabled'
        };
      }

      if (SIGNUP_TYPE === 'invite-only') {
        const [userCount] = await db
          .select({ count: count() })
          .from(user);

        const totalUsers = userCount.count;
        const inviteRequired = totalUsers >= SIGNUP_REQUIRED_AMOUNT;

        return {
          signupEnabled: true,
          inviteRequired,
          reason: inviteRequired ? 'invite-only' : 'open'
        };
      }

      return {
        signupEnabled: false,
        inviteRequired: false,
        reason: 'disabled'
      };
    }),

  getInvites: protectedProcedure
    .query(async ({ ctx }) => {
      const SIGNUP_TYPE = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE || 'disabled';

      if (SIGNUP_TYPE !== 'invite-only') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invites not enabled',
        });
      }

      const userRecord = await db
        .select({ createdAt: user.createdAt })
        .from(user)
        .where(eq(user.id, ctx.session.user.id))
        .limit(1);

      if (userRecord.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const now = new Date();
      const threeDaysAfterCreation = new Date(userRecord[0].createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);
      const isNewUser = now < threeDaysAfterCreation;

      try {
        await db
          .delete(invites)
          .where(
            or(
              eq(invites.revoked, true),
              and(
                lt(invites.expiresAt, now),
                isNull(invites.claimedBy)
              )
            )
          );
      } catch (error) {
        getLogger().error({ err: error }, "Auto-cleanup failed");
      }

      const userInvites = await db
        .select({
          id: invites.id,
          code: invites.code,
          createdAt: invites.createdAt,
          claimedAt: invites.claimedAt,
          claimedBy: invites.claimedBy,
          expiresAt: invites.expiresAt,
          revoked: invites.revoked,
          claimedByName: user.name,
        })
        .from(invites)
        .leftJoin(user, eq(invites.claimedBy, user.id))
        .where(eq(invites.createdBy, ctx.session.user.id))
        .orderBy(invites.createdAt);

      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      const activeInvites = userInvites.filter(
        (invite) =>
          !invite.revoked &&
          !invite.claimedBy &&
          new Date(invite.expiresAt) > now
      );

      const recentlyClaimed = userInvites.filter(
        (invite) =>
          invite.claimedAt &&
          new Date(invite.claimedAt) >= threeDaysAgo
      );

      const usedQuota = activeInvites.length + recentlyClaimed.length;
      const quotaCanCreateNew = usedQuota < 3;
      const canCreateNew = !isNewUser && quotaCanCreateNew;

      return {
        invites: userInvites,
        quota: {
          used: usedQuota,
          total: 3,
          canCreateNew,
          activeCount: activeInvites.length,
          recentlyClaimedCount: recentlyClaimed.length,
        },
        userAge: {
          isNewUser,
          accountCreatedAt: userRecord[0].createdAt,
          canCreateAfter: threeDaysAfterCreation,
        },
      };
    }),

  createInvite: protectedProcedure
    .mutation(async ({ ctx }) => {
      const SIGNUP_TYPE = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE || 'disabled';

      if (SIGNUP_TYPE !== 'invite-only') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invites not enabled',
        });
      }

      const userRecord = await db
        .select({ createdAt: user.createdAt })
        .from(user)
        .where(eq(user.id, ctx.session.user.id))
        .limit(1);

      if (userRecord.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const now = new Date();
      const threeDaysAfterCreation = new Date(userRecord[0].createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);
      const isNewUser = now < threeDaysAfterCreation;

      if (isNewUser) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'New users must wait 3 days before creating invites',
        });
      }

      try {
        await db
          .delete(invites)
          .where(
            or(
              eq(invites.revoked, true),
              and(
                lt(invites.expiresAt, now),
                isNull(invites.claimedBy)
              )
            )
          );
      } catch (error) {
        getLogger().error({ err: error }, "Auto-cleanup failed");
      }

      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      const existingInvites = await db
        .select()
        .from(invites)
        .where(eq(invites.createdBy, ctx.session.user.id));

      const activeInvites = existingInvites.filter(
        (invite) =>
          !invite.revoked &&
          !invite.claimedBy &&
          new Date(invite.expiresAt) > now
      );

      const recentlyClaimed = existingInvites.filter(
        (invite) =>
          invite.claimedAt &&
          new Date(invite.claimedAt) >= threeDaysAgo
      );

      const usedQuota = activeInvites.length + recentlyClaimed.length;

      if (usedQuota >= 3) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You can only have 3 active invites per 3 days',
        });
      }

      const code = nanoid(16);
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const [newInvite] = await db
        .insert(invites)
        .values({
          code,
          createdBy: ctx.session.user.id,
          createdAt: now,
          expiresAt,
          revoked: false,
        })
        .returning();

      return {
        invite: newInvite,
        inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/accept/${code}`,
      };
    }),

  revokeInvite: protectedProcedure
    .input(z.object({
      inviteId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const SIGNUP_TYPE = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE || 'disabled';

      if (SIGNUP_TYPE !== 'invite-only') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invites not enabled',
        });
      }

      const result = await db
        .update(invites)
        .set({ revoked: true })
        .where(
          and(
            eq(invites.id, input.inviteId),
            eq(invites.createdBy, ctx.session.user.id),
            isNull(invites.claimedBy)
          )
        )
        .returning();

      if (result.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invite not found or cannot be revoked',
        });
      }

      try {
        await db
          .delete(invites)
          .where(
            or(
              eq(invites.revoked, true),
              and(
                lt(invites.expiresAt, new Date()),
                isNull(invites.claimedBy)
              )
            )
          );
      } catch (error) {
        getLogger().error({ err: error }, "Auto-cleanup failed");
      }

      return { success: true };
    }),

  validateInvite: publicProcedure
    .input(z.object({
      code: z.string(),
      userId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const SIGNUP_TYPE = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE || 'disabled';

      if (SIGNUP_TYPE !== 'invite-only') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invites not enabled',
        });
      }

      const now = new Date();

      try {
        await db
          .delete(invites)
          .where(
            or(
              eq(invites.revoked, true),
              and(
                lt(invites.expiresAt, now),
                isNull(invites.claimedBy)
              )
            )
          );
      } catch (error) {
        getLogger().error({ err: error }, "Auto-cleanup failed");
      }

      const invite = await db
        .select({
          id: invites.id,
          code: invites.code,
          createdBy: invites.createdBy,
          claimedBy: invites.claimedBy,
          createdAt: invites.createdAt,
          expiresAt: invites.expiresAt,
          revoked: invites.revoked,
          createdByName: user.name,
        })
        .from(invites)
        .leftJoin(user, eq(invites.createdBy, user.id))
        .where(eq(invites.code, input.code))
        .limit(1);

      if (invite.length === 0) {
        return {
          valid: false,
          error: "Invalid invitation code"
        };
      }

      const inviteData = invite[0];

      if (input.userId && inviteData.createdBy === input.userId) {
        return {
          valid: false,
          error: "You cannot use your own invitation code"
        };
      }

      if (inviteData.revoked) {
        return {
          valid: false,
          error: "This invitation has been revoked"
        };
      }

      if (inviteData.claimedBy) {
        return {
          valid: false,
          error: "This invitation has already been used"
        };
      }

      if (new Date(inviteData.expiresAt) <= now) {
        return {
          valid: false,
          error: "This invitation has expired"
        };
      }

      return {
        valid: true,
        invite: {
          id: inviteData.id,
          createdBy: inviteData.createdBy,
          createdByName: inviteData.createdByName,
          createdAt: inviteData.createdAt,
          expiresAt: inviteData.expiresAt,
        },
      };
    }),
});
