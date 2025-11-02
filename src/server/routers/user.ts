import { db } from '@/lib/db';
import { createOpaqueUserId, generateUserOtp, getOtpExpiryTimestamp } from '@/lib/otp';
import { resolveBaseUrl } from '@/lib/base-url';
import { getFetchStatusServer, Region, startFetchServer } from '@/lib/maimai-server-actions';
import { getAvailableVersions } from '@/lib/metadata';
import { splitSongs } from '@/lib/rating-calculator';
import { invites, songs, user, userScores, userSnapshots, userTokens, userEvents } from '@/lib/schema';
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { SongWithScore } from '@/lib/types';
import { TRPCError } from '@trpc/server';
import { randomUUID } from 'crypto';
import { and, count, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { flagDefinitions } from '@/lib/flags';

const SIGNUP_REQUIRED_AMOUNT = 256;

const regionSchema = z.enum(['intl', 'jp']);

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

export const userRouter = router({
  // Check if invites are required for signup
  getSignupRequirements: publicProcedure
    .query(async () => {
      const SIGNUP_TYPE = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE || 'disabled';
      
      // If explicitly disabled or enabled, respect that setting
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
      
      // For invite-only mode, check user count
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
      
      // Default fallback
      return { 
        signupEnabled: false, 
        inviteRequired: false,
        reason: 'disabled'
      };
    }),

  getLoginOtp: protectedProcedure
    .query(({ ctx }) => {
      const userId = ctx.session.user.id;
      const otp = generateUserOtp(userId);
      const expiresAt = new Date(getOtpExpiryTimestamp()).toISOString();
      const baseUrl = resolveBaseUrl();
      const scriptUrl = `${baseUrl}/api/login.js`;
      const opaqueUserId = createOpaqueUserId(userId);
      const loginLink = `https://lng-tgk-aime-gw.am-all.net/common_auth/#otp=${otp}&user=${encodeURIComponent(opaqueUserId)}`;

      return {
        otp,
        scriptUrl,
        loginLink,
        expiresAt,
      };
    }),

  // Get user data
  getUserData: protectedProcedure
    .query(async ({ ctx }) => {
      const userRecord = await db
        .select({ username: user.username, publishProfile: user.publishProfile, region: user.region, role: user.role })
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
        region: userRecord[0].region,
        role: userRecord[0].role,
      };
    }),

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

  // Get user snapshots by region
  getSnapshots: protectedProcedure
    .input(z.object({ region: regionSchema }))
    .query(async ({ ctx, input }) => {
      const snapshots = await db
        .select({
          id: userSnapshots.id,
          fetchedAt: userSnapshots.fetchedAt,
          rating: userSnapshots.rating,
          displayName: userSnapshots.displayName,
          gameVersion: userSnapshots.gameVersion,
          courseRankUrl: userSnapshots.courseRankUrl,
          classRankUrl: userSnapshots.classRankUrl,
          stars: userSnapshots.stars,
          versionPlayCount: userSnapshots.versionPlayCount,
          totalPlayCount: userSnapshots.totalPlayCount,
        })
        .from(userSnapshots)
        .where(
          and(
            eq(userSnapshots.userId, ctx.session.user.id),
            eq(userSnapshots.region, input.region)
          )
        )
        .orderBy(desc(userSnapshots.fetchedAt));

      return { snapshots };
    }),

  // Get rating history for a user by region with song changes
  getRatingHistory: protectedProcedure
    .input(z.object({ region: regionSchema }))
    .query(async ({ ctx, input }) => {
      const startTime = Date.now();
      console.log(`[getRatingHistory] Starting for user ${ctx.session.user.id}, region ${input.region}`);
      
      // Fetch all snapshots for this user/region (lightweight - just metadata)
      const snapshotsStart = Date.now();
      const snapshots = await db
        .select({
          id: userSnapshots.id,
          fetchedAt: userSnapshots.fetchedAt,
          rating: userSnapshots.rating,
          gameVersion: userSnapshots.gameVersion,
        })
        .from(userSnapshots)
        .where(
          and(
            eq(userSnapshots.userId, ctx.session.user.id),
            eq(userSnapshots.region, input.region)
          )
        )
        .orderBy(userSnapshots.fetchedAt);
      console.log(`[getRatingHistory] Fetched ${snapshots.length} snapshots in ${Date.now() - snapshotsStart}ms`);

      if (snapshots.length < 2) {
        console.log(`[getRatingHistory] Completed in ${Date.now() - startTime}ms (insufficient data)`);
        return { 
          history: snapshots.map(s => ({
            date: s.fetchedAt,
            rating: s.rating,
            changes: [],
          }))
        };
      }

      // Group snapshots by date (YYYY-MM-DD) to identify which snapshots we need scores for
      const dateGroupingStart = Date.now();
      const snapshotsByDate = new Map<string, typeof snapshots>();
      for (const snapshot of snapshots) {
        const dateKey = snapshot.fetchedAt.toISOString().split('T')[0];
        if (!snapshotsByDate.has(dateKey)) {
          snapshotsByDate.set(dateKey, []);
        }
        snapshotsByDate.get(dateKey)!.push(snapshot);
      }

      // Get the last snapshot of each date group in chronological order
      const dateGroups = Array.from(snapshotsByDate.entries())
        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
        .map(([date, snapshots]) => ({
          date,
          lastSnapshot: snapshots[snapshots.length - 1],
          allSnapshots: snapshots,
        }));
      console.log(`[getRatingHistory] Grouped ${snapshots.length} snapshots into ${dateGroups.length} date groups in ${Date.now() - dateGroupingStart}ms`);

      // Identify which snapshots we need scores for (only when rating actually changed)
      const snapshotsNeedingScores = new Set<string>();
      for (let i = 0; i < dateGroups.length; i++) {
        const currentGroup = dateGroups[i];
        
        // Always need scores for first snapshot (baseline) and when rating increased
        if (i === 0) {
          snapshotsNeedingScores.add(currentGroup.lastSnapshot.id);
        } else {
          const prevGroup = dateGroups[i - 1];
          if (currentGroup.lastSnapshot.rating > prevGroup.lastSnapshot.rating) {
            // Need both current and previous to compare
            snapshotsNeedingScores.add(currentGroup.lastSnapshot.id);
            snapshotsNeedingScores.add(prevGroup.lastSnapshot.id);
          }
        }
      }
      console.log(`[getRatingHistory] Need scores for ${snapshotsNeedingScores.size} snapshots (out of ${snapshots.length} total)`);

      // Fetch B50 songs only for snapshots we need for comparisons
      const scoresStart = Date.now();
      const relevantSnapshotIds = Array.from(snapshotsNeedingScores);
      const allScores = await db
        .select({
          snapshotId: userScores.snapshotId,
          songId: songs.id,
          songName: songs.songName,
          artist: songs.artist,
          cover: songs.cover,
          difficulty: songs.difficulty,
          level: songs.level,
          levelPrecise: songs.levelPrecise,
          type: songs.type,
          genre: songs.genre,
          addedVersion: songs.addedVersion,
          achievement: userScores.achievement,
          dxScore: userScores.dxScore,
          fc: userScores.fc,
          fs: userScores.fs,
          rank: userScores.rank,
        })
        .from(userScores)
        .innerJoin(songs, eq(userScores.songId, songs.id))
        .where(
          and(
            eq(songs.region, input.region),
            // Only fetch B50 songs (rank 0-49) for efficiency. NULL values are automatically excluded.
            lt(userScores.rank, 50),
            // Only fetch scores for snapshots we actually need
            inArray(userScores.snapshotId, relevantSnapshotIds)
          )
        );
      console.log(`[getRatingHistory] Fetched ${allScores.length} B50 scores in ${Date.now() - scoresStart}ms`);

      // Group scores by snapshot
      const groupingStart = Date.now();
      const scoresBySnapshot = new Map<string, SongWithScore[]>();
      for (const score of allScores) {
        if (!scoresBySnapshot.has(score.snapshotId)) {
          scoresBySnapshot.set(score.snapshotId, []);
        }
        scoresBySnapshot.get(score.snapshotId)!.push({
          songId: score.songId,
          songName: score.songName,
          artist: score.artist,
          cover: score.cover,
          difficulty: score.difficulty as any,
          level: score.level,
          levelPrecise: score.levelPrecise,
          type: score.type as any,
          genre: score.genre,
          addedVersion: score.addedVersion,
          achievement: score.achievement,
          dxScore: score.dxScore,
          fc: score.fc as any,
          fs: score.fs as any,
        });
      }
      console.log(`[getRatingHistory] Grouped scores in ${Date.now() - groupingStart}ms`);

      // Build history with changes (only for last snapshot of each date group)
      const comparisonStart = Date.now();
      const historyWithChanges = [];
      let comparisonsPerformed = 0;
      
      for (let i = 0; i < snapshots.length; i++) {
        const snapshot = snapshots[i];
        const dateKey = snapshot.fetchedAt.toISOString().split('T')[0];
        const dateGroupIndex = dateGroups.findIndex(g => g.date === dateKey);
        const isLastOfGroup = dateGroups[dateGroupIndex]?.lastSnapshot.id === snapshot.id;

        const changes: Array<{
          songId: string;
          songName: string;
          cover: string;
          difficulty: string;
          oldRating?: number;
          newRating: number;
          changeType: 'new' | 'improved';
        }> = [];

        // Only analyze changes for the last snapshot of each date group
        if (isLastOfGroup && dateGroupIndex > 0) {
          const prevDateGroup = dateGroups[dateGroupIndex - 1];
          const prevSnapshot = prevDateGroup.lastSnapshot;

          // Only proceed if rating increased
          if (snapshot.rating > prevSnapshot.rating) {
            const currentSongs = scoresBySnapshot.get(snapshot.id) || [];
            const prevSongs = scoresBySnapshot.get(prevSnapshot.id) || [];

            if (currentSongs.length > 0 && prevSongs.length > 0) {
              comparisonsPerformed++;
              // Calculate top 50 for both snapshots
              const currentTop50 = splitSongs(currentSongs, snapshot.gameVersion);
              const prevTop50 = splitSongs(prevSongs, prevSnapshot.gameVersion);

              const currentB50 = [...currentTop50.newSongsB15, ...currentTop50.oldSongsB35];
              const prevB50 = [...prevTop50.newSongsB15, ...prevTop50.oldSongsB35];

              // Create a map of previous B50 songs for quick lookup
              const prevB50Map = new Map(
                prevB50.map(song => [`${song.songId}-${song.difficulty}`, song.rating])
              );

              // Find new or improved songs in current B50
              for (const song of currentB50) {
                const key = `${song.songId}-${song.difficulty}`;
                const prevRating = prevB50Map.get(key);

                if (prevRating === undefined) {
                  // New song in B50
                  changes.push({
                    songId: song.songId,
                    songName: song.songName,
                    cover: song.cover,
                    difficulty: song.difficulty,
                    newRating: song.rating,
                    changeType: 'new',
                  });
                } else if (song.rating > prevRating) {
                  // Improved rating
                  changes.push({
                    songId: song.songId,
                    songName: song.songName,
                    cover: song.cover,
                    difficulty: song.difficulty,
                    oldRating: prevRating,
                    newRating: song.rating,
                    changeType: 'improved',
                  });
                }
              }
            }
          }
        }

        historyWithChanges.push({
          date: snapshot.fetchedAt,
          rating: snapshot.rating,
          changes,
        });
      }
      console.log(`[getRatingHistory] Performed ${comparisonsPerformed} comparisons in ${Date.now() - comparisonStart}ms`);
      console.log(`[getRatingHistory] Total completed in ${Date.now() - startTime}ms`);

      return { history: historyWithChanges };
    }),

  // Get complete snapshot data including songs for a specific snapshot
  getSnapshotData: protectedProcedure
    .input(z.object({
      snapshotId: z.string(),
      region: regionSchema
    }))
    .query(async ({ ctx, input }) => {
      // First verify the snapshot belongs to the user
      const snapshot = await db
        .select()
        .from(userSnapshots)
        .where(
          and(
            eq(userSnapshots.id, input.snapshotId),
            eq(userSnapshots.userId, ctx.session.user.id),
            eq(userSnapshots.region, input.region)
          )
        )
        .limit(1);

      if (snapshot.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Snapshot not found or access denied',
        });
      }

      // Get songs with scores for this snapshot
      const songsWithScores = await db
        .select({
          songId: songs.id,
          songName: songs.songName,
          artist: songs.artist,
          cover: songs.cover,
          difficulty: songs.difficulty,
          level: songs.level,
          levelPrecise: songs.levelPrecise,
          type: songs.type,
          genre: songs.genre,
          addedVersion: songs.addedVersion,
          achievement: userScores.achievement,
          dxScore: userScores.dxScore,
          fc: userScores.fc,
          fs: userScores.fs,
        })
        .from(userScores)
        .innerJoin(songs, eq(userScores.songId, songs.id))
        .where(eq(userScores.snapshotId, input.snapshotId))
        .orderBy(songs.songName, songs.difficulty);

      // Get events for this snapshot
      const events = await db
        .select({
          id: userEvents.id,
          snapshotId: userEvents.snapshotId,
          eventType: userEvents.eventType,
          name: userEvents.name,
          currentDistance: userEvents.currentDistance,
          nextRewardDistance: userEvents.nextRewardDistance,
          state: userEvents.state,
          imageUrl: userEvents.imageUrl,
          eventPeriodStart: userEvents.eventPeriodStart,
          eventPeriodEnd: userEvents.eventPeriodEnd,
        })
        .from(userEvents)
        .where(eq(userEvents.snapshotId, input.snapshotId));

      return {
        snapshot: snapshot[0],
        songs: songsWithScores,
        events: events,
      };
    }),

  // Delete a snapshot
  deleteSnapshot: protectedProcedure
    .input(z.object({
      snapshotId: z.string(),
      region: regionSchema
    }))
    .mutation(async ({ ctx, input }) => {
      // First verify the snapshot belongs to the user
      const snapshot = await db
        .select({ id: userSnapshots.id })
        .from(userSnapshots)
        .where(
          and(
            eq(userSnapshots.id, input.snapshotId),
            eq(userSnapshots.userId, ctx.session.user.id),
            eq(userSnapshots.region, input.region)
          )
        )
        .limit(1);

      if (snapshot.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Snapshot not found or access denied',
        });
      }

      // Delete user scores associated with this snapshot
      await db
        .delete(userScores)
        .where(eq(userScores.snapshotId, input.snapshotId));

      // Delete the snapshot itself
      await db
        .delete(userSnapshots)
        .where(eq(userSnapshots.id, input.snapshotId));

      return { success: true };
    }),

  // Check if user has a saved token for a region
  hasToken: protectedProcedure
    .input(z.object({ region: regionSchema }))
    .query(async ({ ctx, input }) => {
      const existingToken = await db
        .select({ id: userTokens.id })
        .from(userTokens)
        .where(
          and(
            eq(userTokens.userId, ctx.session.user.id),
            eq(userTokens.region, input.region)
          )
        )
        .limit(1);

      return { hasToken: existingToken.length > 0 };
    }),

  // Start a new data fetch
  startFetch: protectedProcedure
    .input(z.object({
      region: regionSchema,
      token: z.string().optional(), // Token is now optional - we'll use saved token if not provided
      flags: z.string().array().default([]), // Add flags parameter
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await startFetchServer(ctx.session.user.id, input.region as Region, input.token, input.flags);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('No token provided')) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: error.message,
            });
          } else if (error.message.includes('already in progress')) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: error.message,
            });
          } else if (error.message.includes('Rate limited')) {
            throw new TRPCError({
              code: 'TOO_MANY_REQUESTS',
              message: error.message,
            });
          }
        }
        console.error('Failed to start fetch:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start fetch',
        });
      }
    }),

  // Get latest fetch session status
  getFetchStatus: protectedProcedure
    .input(z.object({
      region: regionSchema,
    }))
    .query(async ({ ctx, input }) => {
      return await getFetchStatusServer(ctx.session.user.id, input.region as Region);
    }),

  // Lightweight endpoint to just get the latest fetch session ID (for polling)
  getLatestFetchSessionId: protectedProcedure
    .input(z.object({
      region: regionSchema,
    }))
    .query(async ({ ctx, input }) => {
      const { db } = await import('@/lib/db');
      const { fetchSessions } = await import('@/lib/schema');
      
      const session = await db
        .select({ id: fetchSessions.id, startedAt: fetchSessions.startedAt })
        .from(fetchSessions)
        .where(
          and(
            eq(fetchSessions.userId, ctx.session.user.id),
            eq(fetchSessions.region, input.region)
          )
        )
        .orderBy(desc(fetchSessions.startedAt))
        .limit(1);
      
      return session.length > 0 ? { id: session[0].id, startedAt: session[0].startedAt } : null;
    }),

  // Get user timezone
  getTimezone: protectedProcedure
    .query(async ({ ctx }) => {
      const userRecord = await db
        .select({ timezone: user.timezone })
        .from(user)
        .where(eq(user.id, ctx.session.user.id))
        .limit(1);

      if (userRecord.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return { timezone: userRecord[0].timezone };
    }),

  // Update user timezone
  updateTimezone: protectedProcedure
    .input(z.object({
      timezone: z.string().nullable(), // null = Asia/Tokyo (JP default)
    }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(user)
        .set({
          timezone: input.timezone,
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.session.user.id));

      return { success: true };
    }),

  // Update user region
  updateRegion: protectedProcedure
    .input(z.object({
      region: z.enum(["intl", "jp"]).nullable(), // null = intl (default)
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

  // Get profile settings
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

  // Update publish profile setting
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

  // Update profile main region
  updateProfileMainRegion: protectedProcedure
    .input(z.object({
      profileMainRegion: z.enum(['intl', 'jp']),
    }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(user)
        .set({
          profileMainRegion: input.profileMainRegion,
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.session.user.id));

      return { success: true };
    }),

  // Update profile privacy settings
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

  // Get public profile data
  getPublicProfile: publicProcedure
    .input(z.object({
      username: z.string(),
    }))
    .query(async ({ input }) => {
      const userRecord = await db
        .select({
          id: user.id,
          name: user.name,
          timezone: user.timezone,
          publishProfile: user.publishProfile,
          profileMainRegion: user.profileMainRegion,
          profileShowAllScores: user.profileShowAllScores,
          profileShowScoreDetails: user.profileShowScoreDetails,
          profileShowPlates: user.profileShowPlates,
          profileShowPlayCounts: user.profileShowPlayCounts,
          profileShowEvents: user.profileShowEvents,
          profileShowInSearch: user.profileShowInSearch,
        })
        .from(user)
        .where(eq(user.username, input.username))
        .limit(1);

      if (userRecord.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const userData = userRecord[0];

      // Check if profile is published
      if (!userData.publishProfile) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Profile not published',
        });
      }

      // Check if user allows being found in search (for direct access check)
      if (!userData.profileShowInSearch) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Profile not accessible',
        });
      }

      return userData;
    }),

  // Get public snapshots for a user
  getPublicSnapshots: publicProcedure
    .input(z.object({
      username: z.string(),
      region: regionSchema,
    }))
    .query(async ({ input }) => {
      // First get the user and verify profile is published
      const userRecord = await db
        .select({
          id: user.id,
          publishProfile: user.publishProfile,
          profileShowInSearch: user.profileShowInSearch,
          profileShowPlayCounts: user.profileShowPlayCounts,
        })
        .from(user)
        .where(eq(user.username, input.username))
        .limit(1);

      if (userRecord.length === 0 || !userRecord[0].publishProfile || !userRecord[0].profileShowInSearch) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Profile not found or not accessible',
        });
      }

      const snapshots = await db
        .select({
          id: userSnapshots.id,
          fetchedAt: userSnapshots.fetchedAt,
          rating: userSnapshots.rating,
          displayName: userSnapshots.displayName,
          gameVersion: userSnapshots.gameVersion,
          courseRankUrl: userSnapshots.courseRankUrl,
          classRankUrl: userSnapshots.classRankUrl,
          stars: userSnapshots.stars,
          versionPlayCount: userSnapshots.versionPlayCount,
          totalPlayCount: userSnapshots.totalPlayCount,
        })
        .from(userSnapshots)
        .where(
          and(
            eq(userSnapshots.userId, userRecord[0].id),
            eq(userSnapshots.region, input.region)
          )
        )
        .orderBy(desc(userSnapshots.fetchedAt))
        .limit(1); // Only return the latest snapshot for public profiles

      // Filter play counts based on privacy settings
      const filteredSnapshots = snapshots.map(snapshot => ({
        ...snapshot,
        versionPlayCount: userRecord[0].profileShowPlayCounts ? snapshot.versionPlayCount : 0,
        totalPlayCount: userRecord[0].profileShowPlayCounts ? snapshot.totalPlayCount : 0,
      }));

      return { snapshots: filteredSnapshots };
    }),

  // Get public snapshot data
  getPublicSnapshotData: publicProcedure
    .input(z.object({
      username: z.string(),
      region: regionSchema,
    }))
    .query(async ({ input }) => {
      // First get the user and verify profile is published
      const userRecord = await db
        .select({
          id: user.id,
          publishProfile: user.publishProfile,
          profileShowInSearch: user.profileShowInSearch,
          profileShowAllScores: user.profileShowAllScores,
          profileShowScoreDetails: user.profileShowScoreDetails,
          profileShowPlates: user.profileShowPlates,
          profileShowPlayCounts: user.profileShowPlayCounts,
          profileShowEvents: user.profileShowEvents,
        })
        .from(user)
        .where(eq(user.username, input.username))
        .limit(1);

      if (userRecord.length === 0 || !userRecord[0].publishProfile || !userRecord[0].profileShowInSearch) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Profile not found or not accessible',
        });
      }

      const userData = userRecord[0];

      // Get the latest snapshot for this region
      const snapshot = await db
        .select()
        .from(userSnapshots)
        .where(
          and(
            eq(userSnapshots.userId, userData.id),
            eq(userSnapshots.region, input.region)
          )
        )
        .orderBy(desc(userSnapshots.fetchedAt))
        .limit(1);

      if (snapshot.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No data available for this region',
        });
      }

      // Get songs with scores for this snapshot
      const songsWithScores = await db
        .select({
          songId: songs.id,
          songName: songs.songName,
          artist: songs.artist,
          cover: songs.cover,
          difficulty: songs.difficulty,
          level: songs.level,
          levelPrecise: songs.levelPrecise,
          type: songs.type,
          genre: songs.genre,
          addedVersion: songs.addedVersion,
          achievement: userScores.achievement,
          dxScore: userScores.dxScore,
          fc: userScores.fc,
          fs: userScores.fs,
        })
        .from(userScores)
        .innerJoin(songs, eq(userScores.songId, songs.id))
        .where(eq(userScores.snapshotId, snapshot[0].id))
        .orderBy(songs.songName, songs.difficulty);

      // Convert to SongWithScore format
      const songsForCalculation: SongWithScore[] = songsWithScores.map(song => ({
        songId: song.songId,
        songName: song.songName,
        artist: song.artist,
        cover: song.cover,
        difficulty: song.difficulty as any, // Cast to match enum
        level: song.level,
        levelPrecise: song.levelPrecise,
        type: song.type as any, // Cast to match enum
        genre: song.genre,
        addedVersion: song.addedVersion,
        achievement: song.achievement,
        dxScore: song.dxScore,
        fc: song.fc as any, // Cast to match enum
        fs: song.fs as any, // Cast to match enum
      }));

      // Filter songs based on user privacy settings
      let filteredSongs = songsWithScores;

      if (!userData.profileShowAllScores) {
        const { newSongsB15, oldSongsB35 } = splitSongs(songsForCalculation, snapshot[0].gameVersion);

        // Combine and convert back to original format
        const bestSongs = [...newSongsB15, ...oldSongsB35];
        const bestSongIds = new Set(bestSongs.map(song => song.songId));

        filteredSongs = songsWithScores.filter(song => bestSongIds.has(song.songId));
      }

      return {
        snapshot: snapshot[0],
        songs: filteredSongs,
        privacySettings: {
          showPlayCounts: userData.profileShowPlayCounts,
          showPlates: userData.profileShowPlates,
          showEvents: userData.profileShowEvents,
        },
      };
    }),

  // Invite system procedures
  getInvites: protectedProcedure
    .query(async ({ ctx }) => {
      const SIGNUP_TYPE = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE || 'disabled';
      
      if (SIGNUP_TYPE !== 'invite-only') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invites not enabled',
        });
      }

      // Get user's account creation date
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

      // Auto-cleanup old/revoked invites before fetching user's invites
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
        console.error("Auto-cleanup failed:", error);
        // Don't throw error, just log it so main operation continues
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

      // Calculate quota
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
      
      // New users cannot create invites for 3 days
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

      // Get user's account creation date to check age restriction
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

      // Prevent new users from creating invites
      if (isNewUser) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'New users must wait 3 days before creating invites',
        });
      }

      // Auto-cleanup before creating new invite
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
        console.error("Auto-cleanup failed:", error);
      }

      // Check quota
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

      // Create new invite
      const code = nanoid(16);
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const [newInvite] = await db
        .insert(invites)
        .values({
          id: nanoid(),
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

      // Revoke the invite (only if it's owned by the user and not claimed)
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

      // Auto-cleanup after revoking (to immediately remove the revoked invite)
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
        console.error("Auto-cleanup failed:", error);
      }

      return { success: true };
    }),

  // Public procedure for validating invitation codes (used during signup)
  validateInvite: publicProcedure
    .input(z.object({
      code: z.string(),
      userId: z.string().optional(), // Optional user ID to check for self-claiming
    }))
    .query(async ({ input }) => {
      const SIGNUP_TYPE = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE || 'disabled';
      
      if (SIGNUP_TYPE !== 'invite-only') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invites not enabled',
        });
      }

      // Auto-cleanup before validating
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
        console.error("Auto-cleanup failed:", error);
        // Don't throw error, just log it so main operation continues
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

      // Check if user is trying to claim their own invitation
      if (input.userId && inviteData.createdBy === input.userId) {
        return {
          valid: false,
          error: "You cannot use your own invitation code"
        };
      }

      // Check if invite is valid
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

  // Get available versions for copying (check if versions have songs data)
  getAvailableVersionsForCopy: protectedProcedure
    .input(z.object({
      region: regionSchema,
      currentVersion: z.number(),
    }))
    .query(async ({ input }) => {
      const availableVersions = getAvailableVersions(input.region);
      
      // Filter out the current version
      const otherVersions = availableVersions.filter(v => v.id !== input.currentVersion);
      
      // Get all versions that have songs in a single query
      const versionsWithSongs = await db
        .select({
          gameVersion: songs.gameVersion,
          count: count()
        })
        .from(songs)
        .where(eq(songs.region, input.region))
        .groupBy(songs.gameVersion);

      // Create a set of versions that have songs for efficient lookup
      const versionsWithSongsSet = new Set(
        versionsWithSongs
          .filter(v => v.count > 0)
          .map(v => v.gameVersion)
      );

      // Filter otherVersions to only include those that have songs
      const availableVersionsWithSongs = otherVersions.filter(
        version => versionsWithSongsSet.has(version.id)
      );

      return {
        availableVersions: availableVersionsWithSongs,
      };
    }),

  // Copy snapshot to another game version
  copySnapshotToVersion: protectedProcedure
    .input(z.object({
      snapshotId: z.string(),
      region: regionSchema,
      targetVersion: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // First verify the snapshot belongs to the user
      const sourceSnapshot = await db
        .select()
        .from(userSnapshots)
        .where(
          and(
            eq(userSnapshots.id, input.snapshotId),
            eq(userSnapshots.userId, ctx.session.user.id),
            eq(userSnapshots.region, input.region)
          )
        )
        .limit(1);

      if (sourceSnapshot.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Snapshot not found or access denied',
        });
      }

      const originalSnapshot = sourceSnapshot[0];

      // Create new snapshot with modified data
      const newSnapshotId = randomUUID();
      const newFetchedAt = new Date(originalSnapshot.fetchedAt.getTime() + 1000); // 1 second later

      await db.insert(userSnapshots).values({
        id: newSnapshotId,
        userId: ctx.session.user.id,
        region: input.region,
        fetchedAt: newFetchedAt,
        gameVersion: input.targetVersion,
        rating: originalSnapshot.rating,
        courseRankUrl: originalSnapshot.courseRankUrl,
        classRankUrl: originalSnapshot.classRankUrl,
        stars: originalSnapshot.stars,
        versionPlayCount: 0, // Reset version play count
        totalPlayCount: originalSnapshot.totalPlayCount,
        iconUrl: originalSnapshot.iconUrl,
        displayName: originalSnapshot.displayName,
        title: originalSnapshot.title,
      });

      // Get original scores with song info
      const originalScores = await db
        .select({
          songName: songs.songName,
          songType: songs.type,
          songDifficulty: songs.difficulty,
          achievement: userScores.achievement,
          dxScore: userScores.dxScore,
          fc: userScores.fc,
          fs: userScores.fs,
        })
        .from(userScores)
        .innerJoin(songs, eq(userScores.songId, songs.id))
        .where(eq(userScores.snapshotId, input.snapshotId));

      // Get target version songs for mapping
      const targetVersionSongs = await db
        .select({
          id: songs.id,
          songName: songs.songName,
          type: songs.type,
          difficulty: songs.difficulty,
        })
        .from(songs)
        .where(
          and(
            eq(songs.region, input.region),
            eq(songs.gameVersion, input.targetVersion)
          )
        );

      // Create lookup map for target version songs
      const targetSongLookup = new Map<string, string>(); // key: "songName|type|difficulty", value: songId
      for (const song of targetVersionSongs) {
        const key = `${song.songName}|${song.type}|${song.difficulty}`;
        targetSongLookup.set(key, song.id);
      }

      // Copy scores to new snapshot, mapping song IDs
      const newScores = [];
      for (const originalScore of originalScores) {
        const lookupKey = `${originalScore.songName}|${originalScore.songType}|${originalScore.songDifficulty}`;
        const targetSongId = targetSongLookup.get(lookupKey);

        if (targetSongId) {
          newScores.push({
            id: randomUUID(),
            snapshotId: newSnapshotId,
            songId: targetSongId,
            achievement: originalScore.achievement,
            dxScore: originalScore.dxScore,
            fc: originalScore.fc,
            fs: originalScore.fs,
          });
        }
      }

      // Insert new scores
      if (newScores.length > 0) {
        await db.insert(userScores).values(newScores);
      }

      // Recalculate rating and ranks for the new snapshot
      let newRating = originalSnapshot.rating; // Default fallback
      
      if (newScores.length > 0) {
        // Get all scores with song info for rating calculation
        const scoresWithSongs = await db
          .select({
            scoreId: userScores.id,
            songId: songs.id,
            songName: songs.songName,
            artist: songs.artist,
            cover: songs.cover,
            difficulty: songs.difficulty,
            level: songs.level,
            levelPrecise: songs.levelPrecise,
            type: songs.type,
            genre: songs.genre,
            addedVersion: songs.addedVersion,
            achievement: userScores.achievement,
            dxScore: userScores.dxScore,
            fc: userScores.fc,
            fs: userScores.fs,
          })
          .from(userScores)
          .innerJoin(songs, eq(userScores.songId, songs.id))
          .where(eq(userScores.snapshotId, newSnapshotId));

        // Convert to SongWithScore format for rating calculation
        const songsForCalculation: SongWithScore[] = scoresWithSongs.map(song => ({
          songId: song.songId,
          songName: song.songName,
          artist: song.artist,
          cover: song.cover,
          difficulty: song.difficulty as any, // Cast to match enum
          level: song.level,
          levelPrecise: song.levelPrecise,
          type: song.type as any, // Cast to match enum
          genre: song.genre,
          addedVersion: song.addedVersion,
          achievement: song.achievement,
          dxScore: song.dxScore,
          fc: song.fc as any, // Cast to match enum
          fs: song.fs as any, // Cast to match enum
        }));

        // Calculate ratings for all songs and sort by rating 
        const { newSongsB15, oldSongsB35, newSongsRemaining, oldSongsRemaining } = splitSongs(songsForCalculation, input.targetVersion);

        // Calculate total rating (sum of all rating contributing songs)
        const ratingContributingSongs = [...newSongsB15, ...oldSongsB35];
        newRating = ratingContributingSongs.reduce((sum, song) => sum + song.rating, 0);
        
        // Calculate and assign ranks
        const rankUpdates: Array<{ id: string; rank: number }> = [];
        
        // New B15: ranks 0-14
        for (let i = 0; i < newSongsB15.length; i++) {
          const song = newSongsB15[i];
          const scoreRecord = scoresWithSongs.find(s => 
            s.songId === song.songId && 
            s.difficulty === song.difficulty
          );
          if (scoreRecord) {
            rankUpdates.push({ id: scoreRecord.scoreId, rank: i });
          }
        }
        
        // Old B35: ranks 15-49
        for (let i = 0; i < oldSongsB35.length; i++) {
          const song = oldSongsB35[i];
          const scoreRecord = scoresWithSongs.find(s => 
            s.songId === song.songId && 
            s.difficulty === song.difficulty
          );
          if (scoreRecord) {
            rankUpdates.push({ id: scoreRecord.scoreId, rank: 15 + i });
          }
        }
        
        // Remaining songs: merge and sort by rating desc, start from rank 50
        const remainingSongs = [...newSongsRemaining, ...oldSongsRemaining].sort((a, b) => b.rating - a.rating);
        for (let i = 0; i < remainingSongs.length; i++) {
          const song = remainingSongs[i];
          const scoreRecord = scoresWithSongs.find(s => 
            s.songId === song.songId && 
            s.difficulty === song.difficulty
          );
          if (scoreRecord) {
            rankUpdates.push({ id: scoreRecord.scoreId, rank: 50 + i });
          }
        }
        
        // Batch update ranks using CASE statement
        if (rankUpdates.length > 0) {
          const caseStatements = rankUpdates.map(
            update => sql`WHEN ${userScores.id} = ${update.id} THEN ${update.rank}`
          );
          const ids = rankUpdates.map(update => update.id);
          
          await db
            .update(userScores)
            .set({
              rank: sql`CASE ${sql.join(caseStatements, sql.raw(' '))} END`
            })
            .where(inArray(userScores.id, ids));
        }
      }

      // Update the snapshot with the recalculated rating
      await db
        .update(userSnapshots)
        .set({ rating: newRating })
        .where(eq(userSnapshots.id, newSnapshotId));

      return {
        success: true,
        newSnapshotId,
        copiedScores: newScores.length,
        totalOriginalScores: originalScores.length,
        originalRating: originalSnapshot.rating,
        newRating: newRating,
      };
    }),

  // Get user-selectable flags
  getUserSelectableFlags: publicProcedure
    .query(async () => {
      const selectableFlags: Record<string, any> = {};
      for (const [key, def] of Object.entries(flagDefinitions)) {
        if (def.userSelectable) {
          selectableFlags[key] = def;
        }
      }
      return { flags: selectableFlags };
    }),


}); 