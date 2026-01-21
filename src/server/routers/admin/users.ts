import { router } from '@/lib/trpc';
import { adminProcedure } from '@/lib/admin-middleware';
import { z } from 'zod';
import { db } from '@/lib/db';
import { user, userTokens } from '@/lib/db/schema-pg';
import { eq, desc, count, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { decryptToken } from '@/lib/token-crypto';

export const usersRouter = router({
  resetFetchAlbums: adminProcedure
    .input(z.object({
      identifier: z.string().min(1, 'User identifier is required'),
    }))
    .mutation(async ({ input }) => {
      const { identifier } = input;

      // Find user by username only
      const userRecord = await db
        .select({
          id: user.id,
          email: user.email,
          username: user.username,
          fetchUseAlbums: user.fetchUseAlbums,
        })
        .from(user)
        .where(eq(user.username, identifier))
        .limit(1);

      if (!userRecord.length) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `User not found with identifier: ${identifier}`,
        });
      }

      const foundUser = userRecord[0];
      const previousValue = foundUser.fetchUseAlbums;

      // Update fetchUseAlbums to null
      await db
        .update(user)
        .set({
          fetchUseAlbums: null,
          updatedAt: new Date(),
        })
        .where(eq(user.id, foundUser.id));

      return {
        success: true,
        message: 'User fetchUseAlbums reset to null',
        user: {
          id: foundUser.id,
          email: foundUser.email,
          username: foundUser.username,
          previousValue,
        },
      };
    }),

  listUsers: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { limit, offset, search } = input;

      // Build query with optional search filter
      let query = db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          username: user.username,
          language: user.language,
          role: user.role,
          banned: user.banned,
          banReason: user.banReason,
          banExpires: user.banExpires,
          region: user.region,
          publishProfile: user.publishProfile,
          fetchUseAlbums: user.fetchUseAlbums,
        })
        .from(user);

      // Apply search filter if provided
      if (search) {
        query = query.where(sql`LOWER(${user.username}) LIKE LOWER(${`%${search}%`})`);
      }

      // Get paginated users
      const users = await query
        .orderBy(desc(user.createdAt))
        .limit(limit)
        .offset(offset);

      // Get tokens for all users
      const tokensData = await db
        .select({
          userId: userTokens.userId,
          region: userTokens.region,
        })
        .from(userTokens);

      // Build a map of user tokens
      const tokensMap = new Map<string, string[]>();
      for (const token of tokensData) {
        if (!tokensMap.has(token.userId)) {
          tokensMap.set(token.userId, []);
        }
        tokensMap.get(token.userId)!.push(token.region || '');
      }

      // Add tokens to users
      const usersWithTokens = users.map((u) => ({
        ...u,
        tokens: tokensMap.get(u.id)?.join(', ') || '',
      }));

      // Get total count with search filter applied
      let totalQuery = db.select({ total: count() }).from(user);
      if (search) {
        totalQuery = totalQuery.where(sql`LOWER(${user.username}) LIKE LOWER(${`%${search}%`})`);
      }

      const totalResult = await totalQuery;

      return {
        users: usersWithTokens,
        total: totalResult[0]?.total || 0,
        limit,
        offset,
      };
    }),

  getTokenDetails: adminProcedure
    .input(z.object({
      userId: z.string().min(1, 'User ID is required'),
    }))
    .query(async ({ input }) => {
      const { userId } = input;

      // Verify user exists
      const userRecord = await db
        .select({ id: user.id, username: user.username, email: user.email })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

      if (!userRecord.length) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `User not found with ID: ${userId}`,
        });
      }

      // Get all tokens for this user
      const encryptedTokens = await db
        .select({
          id: userTokens.id,
          region: userTokens.region,
          token: userTokens.token,
          createdAt: userTokens.createdAt,
          updatedAt: userTokens.updatedAt,
        })
        .from(userTokens)
        .where(eq(userTokens.userId, userId))
        .orderBy(desc(userTokens.createdAt));

      // Decrypt tokens
      const tokens = encryptedTokens.map((t) => {
        try {
          return {
            ...t,
            token: decryptToken(t.token),
          };
        } catch (error) {
          console.error(`Failed to decrypt token ${t.id}:`, error);
          return {
            ...t,
            token: '[DECRYPTION_FAILED]',
          };
        }
      });

      return {
        user: userRecord[0],
        tokens,
      };
    }),
});
