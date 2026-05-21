import { db } from '@/lib/db';
import { user } from '@/lib/db/schema-pg';
import { protectedProcedure, router } from '@/lib/trpc';
import { RESERVED_USERNAMES } from '@/server/queries/reserved';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';

// Username validation helper
const isValidUsername = (username: string): boolean => {
  // Check length (1-32 characters)
  if (username.length < 1 || username.length > 32) {
    return false;
  }

  // Check format: only alphanumeric, dash, and underscore
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  return validPattern.test(username);
};

// Generate default username from display name
const generateDefaultUsername = (displayName: string): string => {
  return displayName
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .replace(/[^a-z0-9_-]/g, '') // Remove invalid characters
    .substring(0, 32); // Limit to 32 characters
};

export const usernameRouter = router({
  // Check if username is available
  checkUsernameAvailability: protectedProcedure
    .input(z.object({
      username: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      // Validate format
      if (!isValidUsername(input.username)) {
        return {
          available: false,
          error: 'Username must be 1-32 characters long and contain only letters, numbers, dashes, and underscores',
        };
      }

      if (RESERVED_USERNAMES.has(input.username.toLowerCase())) {
        return {
          available: false,
          error: 'This username is reserved',
        };
      }

      // Check if already taken (but allow current user's username)
      const existingUser = await db
        .select({ id: user.id, username: user.username })
        .from(user)
        .where(eq(user.username, input.username))
        .limit(1);

      if (existingUser.length > 0 && existingUser[0].id !== ctx.session.user.id) {
        return {
          available: false,
          error: 'This username is already taken',
        };
      }

      return { available: true };
    }),

  // Set/update username
  setUsername: protectedProcedure
    .input(z.object({
      username: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Validate format
      if (!isValidUsername(input.username)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Username must be 1-32 characters long and contain only letters, numbers, dashes, and underscores',
        });
      }

      if (RESERVED_USERNAMES.has(input.username.toLowerCase())) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This username is reserved',
        });
      }

      // Check if already taken (but allow current user's username)
      const existingUser = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.username, input.username))
        .limit(1);

      if (existingUser.length > 0 && existingUser[0].id !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This username is already taken',
        });
      }

      // Update username
      await db
        .update(user)
        .set({
          username: input.username,
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.session.user.id));

      return { success: true };
    }),

  // Get suggested username based on display name
  getSuggestedUsername: protectedProcedure
    .query(async ({ ctx }) => {
      const userRecord = await db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, ctx.session.user.id))
        .limit(1);

      if (userRecord.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const suggestedUsername = generateDefaultUsername(userRecord[0].name);

      // If the suggested username is taken, try variations
      let counter = 1;
      let finalSuggestion = suggestedUsername;

      while (true) {
        const existingUser = await db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.username, finalSuggestion))
          .limit(1);

        if (existingUser.length === 0) {
          break; // Username is available
        }

        // Try with counter suffix
        const suffix = counter.toString();
        const baseLength = 32 - suffix.length;
        finalSuggestion = suggestedUsername.substring(0, baseLength) + suffix;
        counter++;

        // Prevent infinite loop (though unlikely)
        if (counter > 1000) {
          finalSuggestion = nanoid(16).toLowerCase();
          break;
        }
      }

      return { suggestedUsername: finalSuggestion };
    }),
});
