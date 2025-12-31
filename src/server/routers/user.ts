import { db } from '@/lib/db';
import { createOpaqueUserId, generateUserOtp, getOtpExpiryTimestamp } from '@/lib/otp';
import { resolveBaseUrl } from '@/lib/base-url';
import { getFetchStatusServer, Region, startFetchServer } from '@/lib/maimai-server-actions';
import { getAvailableVersions } from '@/lib/metadata';
import { RatingCalculationInput, splitSongs } from '@/lib/rating-calculator';
import { invites, songs, user, userScores, userSnapshots, userTokens, userEvents, userRecentSongs, userRecentSongsDetailed, stores, storeEdits, storeEditVotes } from '@/lib/db/schema-pg';
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { SongExtended, SongWithScore } from '@/lib/types';
import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { and, count, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { flagDefinitions } from '@/lib/flags';
import { REGION_ENUM, TIMEZONE_ENUM } from '@/lib/db/types';
import { logger } from '@/lib/logger';
import { Optional } from 'utility-types';
import { getSongSlug, getSongSlugs } from '@/lib/song-slug';
import { SongDetails, UniqueSong, UniqueSongDifficulty } from '@/components/db/songs/types';
import { unstable_cache } from 'next/cache';

const SIGNUP_REQUIRED_AMOUNT = 256;

const regionSchema = z.enum(['intl', 'jp']);
const gameVersionSchema = z.number().int().min(-13).max(20);

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

// Helper to update chosen edit for a store
const updateStoreChosenEdit = async (storeId: bigint) => {
  // Get all edits for this store
  const edits = await db
    .select({
      id: storeEdits.id,
      createdAt: storeEdits.createdAt,
    })
    .from(storeEdits)
    .where(eq(storeEdits.storeId, storeId));

  if (edits.length === 0) {
    await db
      .update(stores)
      .set({ chosenEditId: null })
      .where(eq(stores.id, storeId));
    return;
  }

  // Get vote counts
  const editIds = edits.map(e => e.id);
  const votes = await db
    .select({
      editId: storeEditVotes.editId,
      voteSum: sql<number>`SUM(${storeEditVotes.vote})`.mapWith(Number),
    })
    .from(storeEditVotes)
    .where(inArray(storeEditVotes.editId, editIds))
    .groupBy(storeEditVotes.editId);

  const votesMap = new Map(votes.map(v => [v.editId, v.voteSum]));

  // Sort edits: highest votes first, then latest created
  const sortedEdits = edits.sort((a, b) => {
    const votesA = votesMap.get(a.id) || 0;
    const votesB = votesMap.get(b.id) || 0;

    if (votesA !== votesB) {
      return votesB - votesA;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const bestEdit = sortedEdits[0];

  await db
    .update(stores)
    .set({ chosenEditId: bestEdit.id })
    .where(eq(stores.id, storeId));
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
          id: userSnapshots.publicId,
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
      logger.info(`Starting getRatingHistory for user ${ctx.session.user.id}, region ${input.region}`);

      // Fetch all snapshots for this user/region (lightweight - just metadata)
      const snapshotsStart = Date.now();
      const snapshots = await db
        .select({
          internalId: userSnapshots.id,
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
      logger.info(`Fetched ${snapshots.length} snapshots in ${Date.now() - snapshotsStart}ms`);

      if (snapshots.length < 2) {
        logger.info(`Completed in ${Date.now() - startTime}ms (insufficient data)`);
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
      logger.info(`Grouped ${snapshots.length} snapshots into ${dateGroups.length} date groups in ${Date.now() - dateGroupingStart}ms`);

      // Identify which snapshots we need scores for (only when rating actually changed)
      const snapshotsNeedingScores = new Set<bigint>();
      for (let i = 0; i < dateGroups.length; i++) {
        const currentGroup = dateGroups[i];

        // Always need scores for first snapshot (baseline) and when rating increased
        if (i === 0) {
          snapshotsNeedingScores.add(currentGroup.lastSnapshot.internalId);
        } else {
          const prevGroup = dateGroups[i - 1];
          if (currentGroup.lastSnapshot.rating > prevGroup.lastSnapshot.rating) {
            // Need both current and previous to compare
            snapshotsNeedingScores.add(currentGroup.lastSnapshot.internalId);
            snapshotsNeedingScores.add(prevGroup.lastSnapshot.internalId);
          }
        }
      }
      logger.info(`Need scores for ${snapshotsNeedingScores.size} snapshots (out of ${snapshots.length} total)`);

      // Fetch B50 songs only for snapshots we need for comparisons
      const scoresStart = Date.now();
      const relevantSnapshotIds = Array.from(snapshotsNeedingScores);
      const allScores = await db
        .select({
          snapshotId: userScores.snapshotId,
          songId: songs.id,
          songName: songs.songName,
          cover: songs.cover,
          difficulty: songs.difficulty,
          levelPrecise: songs.levelPrecise,
          addedVersion: songs.addedVersion,
          achievement: userScores.achievement,
          fc: userScores.fc,
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
      logger.info(`Fetched ${allScores.length} B50 scores in ${Date.now() - scoresStart}ms`);

      // Group scores by snapshot
      const groupingStart = Date.now();
      const scoresBySnapshot = new Map<bigint, Array<{
        songId: bigint;
        songName: string;
        cover: string;
        difficulty: string;
        levelPrecise: number;
        addedVersion: number;
        achievement: number;
        fc: RatingCalculationInput["fc"];
      }>>();
      for (const score of allScores) {
        if (!scoresBySnapshot.has(score.snapshotId)) {
          scoresBySnapshot.set(score.snapshotId, []);
        }
        scoresBySnapshot.get(score.snapshotId)!.push({
          songId: score.songId,
          songName: score.songName,
          cover: score.cover,
          difficulty: score.difficulty,
          levelPrecise: score.levelPrecise,
          addedVersion: score.addedVersion,
          achievement: score.achievement,
          fc: score.fc,
        });
      }
      logger.info(`Grouped scores in ${Date.now() - groupingStart}ms`);

      // Build history with changes (only for last snapshot of each date group)
      const comparisonStart = Date.now();
      const historyWithChanges = [];
      let comparisonsPerformed = 0;

      for (let i = 0; i < snapshots.length; i++) {
        const snapshot = snapshots[i];
        const dateKey = snapshot.fetchedAt.toISOString().split('T')[0];
        const dateGroupIndex = dateGroups.findIndex(g => g.date === dateKey);
        const isLastOfGroup = dateGroups[dateGroupIndex]?.lastSnapshot.internalId === snapshot.internalId;

        const changes: Array<{
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
            const currentSongs = scoresBySnapshot.get(snapshot.internalId) || [];
            const prevSongs = scoresBySnapshot.get(prevSnapshot.internalId) || [];

            if (currentSongs.length > 0 && prevSongs.length > 0) {
              comparisonsPerformed++;
              // Calculate top 50 for both snapshots (cast to any for splitSongs compatibility)
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
                    songName: song.songName,
                    cover: song.cover,
                    difficulty: song.difficulty,
                    newRating: song.rating,
                    changeType: 'new',
                  });
                } else if (song.rating > prevRating) {
                  // Improved rating
                  changes.push({
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
      logger.info(`Performed ${comparisonsPerformed} comparisons in ${Date.now() - comparisonStart}ms`);
      logger.info(`Total completed in ${Date.now() - startTime}ms`);

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
            eq(userSnapshots.publicId, input.snapshotId),
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
          songId: songs.publicId,
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

      // Get events for this snapshot
      const events = await db
        .select({
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
        .where(eq(userEvents.snapshotId, snapshot[0].id));

      return {
        snapshot: {
          ...snapshot[0],
          publicId: undefined,
          id: snapshot[0].publicId,
        },
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
            eq(userSnapshots.publicId, input.snapshotId),
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

      // Delete the snapshot itself
      await db
        .delete(userSnapshots)
        .where(eq(userSnapshots.id, snapshot[0].id));

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
      const { fetchSessions: fs } = await import('@/lib/db/schema-pg');

      const session = await db
        .select({ publicId: fs.publicId, startedAt: fs.startedAt })
        .from(fs)
        .where(
          and(
            eq(fs.userId, ctx.session.user.id),
            eq(fs.region, input.region)
          )
        )
        .orderBy(desc(fs.startedAt))
        .limit(1);

      return session.length > 0 ? { id: session[0].publicId, startedAt: session[0].startedAt } : null;
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
      timezone: z.enum(TIMEZONE_ENUM).nullable(),
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
      region: z.enum(REGION_ENUM).nullable(),
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
          id: userSnapshots.publicId,
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
          songId: songs.publicId,
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
        difficulty: song.difficulty,
        level: song.level,
        levelPrecise: song.levelPrecise,
        type: song.type,
        genre: song.genre,
        addedVersion: song.addedVersion,
        achievement: song.achievement,
        dxScore: song.dxScore,
        fc: song.fc,
        fs: song.fs,
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
        snapshot: {
          ...snapshot[0],
          publicId: undefined,
          id: snapshot[0].publicId, // Use publicId as the external-facing id
        },
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
            eq(userSnapshots.publicId, input.snapshotId),
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
      const newSnapshotPublicId = nanoid();
      const newFetchedAt = new Date(originalSnapshot.fetchedAt.getTime() + 1000); // 1 second later

      const [newSnapshot] = await db.insert(userSnapshots).values({
        publicId: newSnapshotPublicId,
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
      }).returning({ id: userSnapshots.id });

      const newSnapshotInternalId = newSnapshot.id;

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
        .where(eq(userScores.snapshotId, originalSnapshot.id));

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
      const targetSongLookup = new Map<string, bigint>(); // key: "songName|type|difficulty", value: internal songId
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
            snapshotId: newSnapshotInternalId,
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
            scoreId: userScores.id, // Internal ID
            songId: songs.id, // Internal ID
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
          .where(eq(userScores.snapshotId, newSnapshotInternalId));

        // Convert to SongWithScore format for rating calculation
        const songsForCalculation: (Omit<SongWithScore, 'songId'> & { songId: bigint })[] = scoresWithSongs.map(song => ({
          songId: song.songId,
          songName: song.songName,
          artist: song.artist,
          cover: song.cover,
          difficulty: song.difficulty,
          level: song.level,
          levelPrecise: song.levelPrecise,
          type: song.type,
          genre: song.genre,
          addedVersion: song.addedVersion,
          achievement: song.achievement,
          dxScore: song.dxScore,
          fc: song.fc,
          fs: song.fs,
        }));

        // Calculate ratings for all songs and sort by rating
        const { newSongsB15, oldSongsB35, newSongsRemaining, oldSongsRemaining } = splitSongs(songsForCalculation, input.targetVersion);

        // Calculate total rating (sum of all rating contributing songs)
        const ratingContributingSongs = [...newSongsB15, ...oldSongsB35];
        newRating = ratingContributingSongs.reduce((sum, song) => sum + song.rating, 0);

        // Calculate and assign ranks
        const rankUpdates: Array<{ id: bigint; rank: number }> = [];

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
        .where(eq(userSnapshots.id, newSnapshotInternalId));

      return {
        success: true,
        newSnapshotId: newSnapshotPublicId,
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

  // Get recent songs for a user
  getRecentSongs: protectedProcedure
    .input(z.object({
      region: regionSchema,
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      beforeDate: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { region, limit, offset, beforeDate } = input;

      // Query recent songs with song data and optional detailed data
      const recentPlays = await db
        .select({
          // Recent song data
          recentSongId: userRecentSongs.id,
          playedAt: userRecentSongs.playedAt,
          achievement: userRecentSongs.archievement,
          dxScore: userRecentSongs.dxScore,
          maxDxScore: userRecentSongs.maxDxScore,
          fc: userRecentSongs.fc,
          fs: userRecentSongs.fs,
          track: userRecentSongs.track,
          // Song data
          songId: songs.id,
          songPublicId: songs.publicId,
          songName: songs.songName,
          artist: songs.artist,
          cover: songs.cover,
          difficulty: songs.difficulty,
          level: songs.level,
          levelPrecise: songs.levelPrecise,
          type: songs.type,
          genre: songs.genre,
          // Detailed data (may be null)
          fastCount: userRecentSongsDetailed.fastCount,
          lateCount: userRecentSongsDetailed.lateCount,
          combo: userRecentSongsDetailed.combo,
          maxCombo: userRecentSongsDetailed.maxCombo,
          syncScore: userRecentSongsDetailed.syncScore,
          maxSyncScore: userRecentSongsDetailed.maxSyncScore,
          rating: userRecentSongsDetailed.rating,
          ratingChange: userRecentSongsDetailed.ratingChange,
          venue: userRecentSongsDetailed.venue,
          // Note data
          tapCPerfect: userRecentSongsDetailed.tapCPerfect,
          tapPerfect: userRecentSongsDetailed.tapPerfect,
          tapGreat: userRecentSongsDetailed.tapGreat,
          tapGood: userRecentSongsDetailed.tapGood,
          tapMiss: userRecentSongsDetailed.tapMiss,
          holdCPerfect: userRecentSongsDetailed.holdCPerfect,
          holdPerfect: userRecentSongsDetailed.holdPerfect,
          holdGreat: userRecentSongsDetailed.holdGreat,
          holdGood: userRecentSongsDetailed.holdGood,
          holdMiss: userRecentSongsDetailed.holdMiss,
          slideCPerfect: userRecentSongsDetailed.slideCPerfect,
          slidePerfect: userRecentSongsDetailed.slidePerfect,
          slideGreat: userRecentSongsDetailed.slideGreat,
          slideGood: userRecentSongsDetailed.slideGood,
          slideMiss: userRecentSongsDetailed.slideMiss,
          touchCPerfect: userRecentSongsDetailed.touchCPerfect,
          touchPerfect: userRecentSongsDetailed.touchPerfect,
          touchGreat: userRecentSongsDetailed.touchGreat,
          touchGood: userRecentSongsDetailed.touchGood,
          touchMiss: userRecentSongsDetailed.touchMiss,
          breakCPerfect: userRecentSongsDetailed.breakCPerfect,
          breakPerfect: userRecentSongsDetailed.breakPerfect,
          breakGreat: userRecentSongsDetailed.breakGreat,
          breakGood: userRecentSongsDetailed.breakGood,
          breakMiss: userRecentSongsDetailed.breakMiss,
        })
        .from(userRecentSongs)
        .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
        .leftJoin(userRecentSongsDetailed, eq(userRecentSongs.id, userRecentSongsDetailed.recentSongId))
        .where(
          and(
            eq(userRecentSongs.userId, userId),
            eq(songs.region, region),
            beforeDate ? lt(userRecentSongs.playedAt, beforeDate) : undefined
          )
        )
        .orderBy(desc(userRecentSongs.playedAt))
        .limit(limit)
        .offset(offset);

      // Get total count
      const [{ totalCount }] = await db
        .select({ totalCount: count() })
        .from(userRecentSongs)
        .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
        .where(
          and(
            eq(userRecentSongs.userId, userId),
            eq(songs.region, region),
            beforeDate ? lt(userRecentSongs.playedAt, beforeDate) : undefined
          )
        );

      return {
        recentPlays,
        totalCount,
        hasMore: offset + limit < totalCount,
      };
    }),

  // Get all stores with their chosen edits (public)
  getStores: publicProcedure
    .query(async () => {
      // Fetch all stores with their chosen edits
      const allStores = await db
        .select({
          id: stores.id,
          country: stores.country,
          area: stores.area,
          name: stores.name,
          address: stores.address,
          location: stores.location,
          chosenEditId: stores.chosenEditId,
        })
        .from(stores);

      // Fetch all chosen edits
      const chosenEditIds = allStores
        .map(s => s.chosenEditId)
        .filter((id): id is bigint => id !== null);

      const edits = chosenEditIds.length > 0
        ? await db
          .select()
          .from(storeEdits)
          .where(inArray(storeEdits.id, chosenEditIds))
        : [];

      // Build a map of edits by ID
      const editsMap = new Map(edits.map(edit => [edit.id, edit]));

      // Format response - convert location point to coords
      const storesWithEdits = allStores.map(store => {
        const chosenEdit = store.chosenEditId ? editsMap.get(store.chosenEditId) : null;

        return {
          id: store.id,
          country: store.country,
          area: store.area,
          name: store.name,
          address: store.address,
          location: store.location,
          chosenEdit: chosenEdit ? {
            name: chosenEdit.name,
            address: chosenEdit.address,
            openingHours: chosenEdit.openingHours,
            toilet: chosenEdit.toilet,
            smoke: chosenEdit.smoke,
            access: chosenEdit.access,
            status: chosenEdit.status,
            currency: chosenEdit.currency,
            games: chosenEdit.games,
            additionalInfo: chosenEdit.additionalInfo,
          } : null,
        };
      });

      return {
        stores: storesWithEdits,
      };
    }),

  // Get all edits for a specific store (public)
  getStoreEdits: publicProcedure
    .input(z.object({
      storeId: z.bigint(),
    }))
    .query(async ({ input }) => {
      // Get store's chosen edit ID
      const store = await db
        .select({ chosenEditId: stores.chosenEditId })
        .from(stores)
        .where(eq(stores.id, input.storeId))
        .limit(1);

      const chosenEditId = store[0]?.chosenEditId;

      // Get all edits for this store
      const edits = await db
        .select({
          id: storeEdits.id,
          userId: storeEdits.userId,
          userName: user.name,
          name: storeEdits.name,
          address: storeEdits.address,
          openingHours: storeEdits.openingHours,
          toilet: storeEdits.toilet,
          smoke: storeEdits.smoke,
          access: storeEdits.access,
          status: storeEdits.status,
          currency: storeEdits.currency,
          games: storeEdits.games,
          additionalInfo: storeEdits.additionalInfo,
          createdAt: storeEdits.createdAt,
          updatedAt: storeEdits.updatedAt,
        })
        .from(storeEdits)
        .innerJoin(user, eq(storeEdits.userId, user.id))
        .where(eq(storeEdits.storeId, input.storeId))
        .orderBy(desc(storeEdits.createdAt));

      // Get vote counts for each edit
      const editIds = edits.map(e => e.id);
      const votes = editIds.length > 0 ? await db
        .select({
          editId: storeEditVotes.editId,
          voteSum: sql<number>`SUM(${storeEditVotes.vote})`.mapWith(Number),
        })
        .from(storeEditVotes)
        .where(inArray(storeEditVotes.editId, editIds))
        .groupBy(storeEditVotes.editId)
        : [];

      const votesMap = new Map(votes.map(v => [v.editId, v.voteSum]));

      return {
        edits: edits.map(edit => ({
          ...edit,
          voteCount: votesMap.get(edit.id) || 0,
          isChosen: edit.id === chosenEditId,
        })),
      };
    }),

  // Get user's vote status for store edits
  getUserStoreEditVotes: protectedProcedure
    .input(z.object({
      storeId: z.bigint(),
    }))
    .query(async ({ ctx, input }) => {
      // Get all edit IDs for this store
      const edits = await db
        .select({ id: storeEdits.id })
        .from(storeEdits)
        .where(eq(storeEdits.storeId, input.storeId));

      const editIds = edits.map(e => e.id);

      if (editIds.length === 0) {
        return { votes: [] };
      }

      // Get user's votes for these edits
      const userVotes = await db
        .select({
          editId: storeEditVotes.editId,
          vote: storeEditVotes.vote,
        })
        .from(storeEditVotes)
        .where(
          and(
            inArray(storeEditVotes.editId, editIds),
            eq(storeEditVotes.userId, ctx.session.user.id)
          )
        );

      return {
        votes: userVotes.map(v => ({ ...v, editId: v.editId })),
      };
    }),

  // Vote on a store edit
  voteOnStoreEdit: protectedProcedure
    .input(z.object({
      editId: z.bigint(),
      vote: z.enum(['upvote', 'downvote', 'remove']),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get storeId to update chosen edit later
      const edit = await db
        .select({ storeId: storeEdits.storeId })
        .from(storeEdits)
        .where(eq(storeEdits.id, input.editId))
        .limit(1);

      if (edit.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Edit not found',
        });
      }
      const storeId = edit[0].storeId;

      const voteValue = input.vote === 'upvote' ? 1 : input.vote === 'downvote' ? -1 : 0;

      if (input.vote === 'remove') {
        // Remove vote
        await db
          .delete(storeEditVotes)
          .where(
            and(
              eq(storeEditVotes.editId, input.editId),
              eq(storeEditVotes.userId, ctx.session.user.id)
            )
          );
      } else {
        // Upsert vote
        await db
          .insert(storeEditVotes)
          .values({
            editId: input.editId,
            userId: ctx.session.user.id,
            vote: voteValue,
          })
          .onConflictDoUpdate({
            target: [storeEditVotes.userId, storeEditVotes.editId],
            set: {
              vote: voteValue,
            },
          });
      }

      // Update chosen edit
      await updateStoreChosenEdit(storeId);

      return { success: true };
    }),

  // Get user's edit for a store
  getUserStoreEdit: protectedProcedure
    .input(z.object({
      storeId: z.bigint(),
    }))
    .query(async ({ ctx, input }) => {
      const userEdit = await db
        .select()
        .from(storeEdits)
        .where(
          and(
            eq(storeEdits.storeId, input.storeId),
            eq(storeEdits.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      return {
        edit: userEdit[0] ? { ...userEdit[0], id: userEdit[0].id } : null,
      };
    }),

  // Create a new store edit
  createStoreEdit: protectedProcedure
    .input(z.object({
      storeId: z.bigint(),
      name: z.string().min(1).max(32).nullable(),
      address: z.string().min(10).max(256).nullable(),
      openingHours: z.string().nullable(),
      toilet: z.boolean().nullable(),
      smoke: z.boolean().nullable(),
      access: z.string().nullable(),
      status: z.enum(["open", "closed", "temporarily_closed"]).nullable(),
      currency: z.string(),
      games: z.record(z.string(), z.object({
        amount: z.number().int().min(0).optional(),
        price: z.number().optional(),
      })).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if user already has an edit for this store
      const existingEdit = await db
        .select()
        .from(storeEdits)
        .where(
          and(
            eq(storeEdits.storeId, input.storeId),
            eq(storeEdits.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (existingEdit.length > 0) {
        // Check if the existing edit is the chosen one
        const store = await db
          .select({ chosenEditId: stores.chosenEditId })
          .from(stores)
          .where(eq(stores.id, input.storeId))
          .limit(1);

        if (!store.length || store[0].chosenEditId !== existingEdit[0].id) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'You already have an edit for this store. Please edit or delete your existing edit.',
          });
        }
        // If existing edit is chosen, allow creating another
      }

      // Create the edit
      const [newEdit] = await db
        .insert(storeEdits)
        .values({
          storeId: input.storeId,
          userId: ctx.session.user.id,
          name: input.name,
          address: input.address,
          openingHours: input.openingHours,
          toilet: input.toilet,
          smoke: input.smoke,
          access: input.access,
          status: input.status,
          currency: input.currency,
          games: input.games as any,
        })
        .returning();

      // Auto-upvote the creator's own edit
      await db.insert(storeEditVotes).values({
        editId: newEdit.id,
        userId: ctx.session.user.id,
        vote: 1,
      });

      // Update chosen edit
      await updateStoreChosenEdit(input.storeId);

      return { success: true, editId: newEdit.id };
    }),

  // Update an existing store edit
  updateStoreEdit: protectedProcedure
    .input(z.object({
      editId: z.bigint(),
      storeId: z.bigint(),
      name: z.string().min(1).max(32).nullable(),
      address: z.string().min(10).max(256).nullable(),
      openingHours: z.string().nullable(),
      toilet: z.boolean().nullable(),
      smoke: z.boolean().nullable(),
      access: z.string().nullable(),
      status: z.enum(["open", "closed", "temporarily_closed"]).nullable(),
      currency: z.string(),
      games: z.record(z.string(), z.object({
        amount: z.number().int().min(0).optional(),
        price: z.number().optional(),
      })).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const edit = await db
        .select()
        .from(storeEdits)
        .where(
          and(
            eq(storeEdits.id, input.editId),
            eq(storeEdits.storeId, input.storeId)
          )
        )
        .limit(1);

      if (edit.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Edit not found',
        });
      }

      if (edit[0].userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only edit your own submissions',
        });
      }

      // Check if this is the chosen edit
      const store = await db
        .select({ chosenEditId: stores.chosenEditId })
        .from(stores)
        .where(eq(stores.id, input.storeId))
        .limit(1);

      if (store.length > 0 && store[0].chosenEditId === input.editId) {
        // Check if there are any edits by other users
        const otherUserEdits = await db
          .select({ id: storeEdits.id })
          .from(storeEdits)
          .where(
            and(
              eq(storeEdits.storeId, input.storeId),
              sql`${storeEdits.userId} != ${ctx.session.user.id}`
            )
          );

        if (otherUserEdits.length > 0) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot edit the chosen edit when other users have contributed',
          });
        }
      }

      // Update the edit
      await db
        .update(storeEdits)
        .set({
          name: input.name,
          address: input.address,
          openingHours: input.openingHours,
          toilet: input.toilet,
          smoke: input.smoke,
          access: input.access,
          status: input.status,
          currency: input.currency,
          games: input.games as any,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(storeEdits.id, input.editId),
            eq(storeEdits.storeId, input.storeId)
          )
        );

      return { success: true };
    }),

  // Delete a store edit
  deleteStoreEdit: protectedProcedure
    .input(z.object({
      editId: z.bigint(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const edit = await db
        .select()
        .from(storeEdits)
        .where(eq(storeEdits.id, input.editId))
        .limit(1);

      if (edit.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Edit not found',
        });
      }

      if (edit[0].userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only delete your own submissions',
        });
      }

      // Check if this is the chosen edit
      const store = await db
        .select({ chosenEditId: stores.chosenEditId })
        .from(stores)
        .where(eq(stores.id, edit[0].storeId))
        .limit(1);

      if (store.length > 0 && store[0].chosenEditId === input.editId) {
        // Check if there are any edits by other users
        const otherUserEdits = await db
          .select({ id: storeEdits.id })
          .from(storeEdits)
          .where(
            and(
              eq(storeEdits.storeId, edit[0].storeId),
              sql`${storeEdits.userId} != ${ctx.session.user.id}`
            )
          );

        if (otherUserEdits.length > 0) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot delete the chosen edit when other users have contributed',
          });
        }
      }

      // Delete the edit (votes will cascade delete)
      await db
        .delete(storeEdits)
        .where(eq(storeEdits.id, input.editId));

      // Update chosen edit
      await updateStoreChosenEdit(edit[0].storeId);

      return { success: true };
    }),

  // Get all unique songs across all regions and versions (for database page)
  getAllUniqueSongs: publicProcedure
    .query(async () => {
      const getCachedUniqueSongs = unstable_cache(
        async () => {
          const allSongs = await db
            .select({
              id: songs.id,
              songName: songs.songName,
              artist: songs.artist,
              cover: songs.cover,
              type: songs.type,
              genre: songs.genre,
              difficulty: songs.difficulty,
              levelPrecise: songs.levelPrecise,
              noteDesigner: songs.noteDesigner,
              addedVersion: songs.addedVersion,
              region: songs.region,
              gameVersion: songs.gameVersion,
            })
            .from(songs)
            .orderBy(songs.songName);

          const allSongsSortedById = [...allSongs].sort((a, b) => Number(a.id) - Number(b.id));
          const allSongsToSortedIndex = Object.fromEntries(allSongsSortedById.map((song, index) => [String(song.id), index]));
          const allSongsWithIndex = allSongs.map((song) => (
            { ...song, index: allSongsToSortedIndex[String(song.id)]! } satisfies Optional<typeof song, 'id'> & { index: number }
          ));

          // Deduplicate by songName + type (same song can have std and dx versions)
          const uniqueSongs: Map<string, typeof allSongsWithIndex[0] & {
            difficulties: (UniqueSongDifficulty & {
              region: Region;
              gameVersion: number;
            })[];
          }> = new Map();
          for (const song of allSongsWithIndex) {
            const key = `${song.songName}||${song.type}`;
            if (!uniqueSongs.has(key)) {
              uniqueSongs.set(key, {
                ...song,
                difficulties: [],
              });
            } else {
              uniqueSongs.set(key, {
                ...uniqueSongs.get(key)!,
                difficulties: [...uniqueSongs.get(key)!.difficulties],
                ...song,
              });
            }
            const existingDifficulty = uniqueSongs.get(key)!.difficulties.find(d => d.difficulty === song.difficulty);
            if (existingDifficulty) {
              if (existingDifficulty.gameVersion < song.gameVersion || (existingDifficulty.gameVersion === song.gameVersion && song.region === "jp" && existingDifficulty.region === "intl")) {
                uniqueSongs.get(key)!.difficulties.splice(uniqueSongs.get(key)!.difficulties.indexOf(existingDifficulty), 1);
              } else continue;
            }

            uniqueSongs.get(key)!.difficulties.push({
              difficulty: song.difficulty,
              levelPrecise: song.levelPrecise,
              region: song.region,
              gameVersion: song.gameVersion,
              noteDesigner: song.noteDesigner,
            });
          }

          // Add pre-computed slugs for URL routing
          const songsWithSlugs = await getSongSlugs(Array.from(uniqueSongs.values()));
          const songsStripped: UniqueSong[] = songsWithSlugs.map((song) => {
            return {
              index: song.index,
              songName: song.songName,
              artist: song.artist,
              cover: song.cover,
              type: song.type,
              genre: song.genre,
              addedVersion: song.addedVersion,
              difficulties: song.difficulties.map(d => ({
                difficulty: d.difficulty,
                levelPrecise: d.levelPrecise,
                noteDesigner: d.noteDesigner,
              }) satisfies UniqueSongDifficulty),
              slug: song.slug,
              aliases: song.aliases,
            } satisfies UniqueSong;
          });
          return songsStripped;
        },
        ['all-unique-songs'],
        {
          revalidate: 3600, // 1 hour
          tags: ['all-unique-songs']
        }
      );

      return getCachedUniqueSongs();
    }),

  // Get detailed info for a specific song (by name and type) across all regions/versions
  getSongDetails: publicProcedure
    .input(z.object({
      songName: z.string(),
      type: z.enum(['std', 'dx']),
    }))
    .query(async ({ input, ctx }) => {
      const chartsQuery = db
        .select({
          songId: songs.publicId,
          songName: songs.songName,
          artist: songs.artist,
          cover: songs.cover,
          difficulty: songs.difficulty,
          level: songs.level,
          levelPrecise: songs.levelPrecise,
          type: songs.type,
          genre: songs.genre,
          region: songs.region,
          gameVersion: songs.gameVersion,
          addedVersion: songs.addedVersion,
          bpm: songs.bpm,
          noteDesigner: songs.noteDesigner,
          tapCount: songs.tapCount,
          holdCount: songs.holdCount,
          slideCount: songs.slideCount,
          touchCount: songs.touchCount,
          breakCount: songs.breakCount,
        })
        .from(songs)
        .where(
          and(
            eq(songs.songName, input.songName),
            eq(songs.type, input.type)
          )
        )
        .orderBy(songs.region, desc(songs.gameVersion), songs.difficulty);

      // Fetch user scores if logged in (parallel query)
      let scoresQuery: Promise<{ region: string; difficulty: string; achievement: number; fc: string; fs: string }[]> = Promise.resolve([]);

      if (ctx.session?.user?.id) {
        const userId = ctx.session.user.id;

        scoresQuery = db
          .select({
            region: songs.region,
            difficulty: songs.difficulty,
            achievement: userScores.achievement,
            fc: userScores.fc,
            fs: userScores.fs,
          })
          .from(userScores)
          .innerJoin(songs, eq(userScores.songId, songs.id))
          .where(
            and(
              eq(songs.songName, input.songName),
              eq(songs.type, input.type),
              inArray(
                userScores.snapshotId,
                db.selectDistinctOn([userSnapshots.region], { id: userSnapshots.id })
                  .from(userSnapshots)
                  .where(eq(userSnapshots.userId, userId))
                  .orderBy(userSnapshots.region, desc(userSnapshots.fetchedAt))
              )
            )
          );
      }

      const [charts, scores] = await Promise.all([chartsQuery, scoresQuery]);

      if (charts.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Song not found',
        });
      }

      let userScoresMap: Record<string, Record<string, { achievement: number; fc: string; fs: string }>> | undefined;
      if (scores.length > 0) {
        userScoresMap = {};
        for (const score of scores) {
          if (!userScoresMap[score.region]) {
            userScoresMap[score.region] = {};
          }
          userScoresMap[score.region][score.difficulty] = {
            achievement: score.achievement,
            fc: score.fc,
            fs: score.fs
          };
        }
      }

      // Group charts by region -> gameVersion -> difficulty
      const byRegion = new Map<Region, Map<number, SongExtended[]>>();
      for (const chart of charts) {
        if (!byRegion.has(chart.region)) {
          byRegion.set(chart.region, new Map());
        }
        const regionMap = byRegion.get(chart.region)!;
        if (!regionMap.has(chart.gameVersion)) {
          regionMap.set(chart.gameVersion, []);
        }
        regionMap.get(chart.gameVersion)!.push(chart);
      }

      // Convert to serializable format
      const regions = Array.from(byRegion.entries()).map(([region, versionMap]) => ({
        region,
        versions: Array.from(versionMap.entries()).map(([version, vCharts]) => ({
          gameVersion: version,
          charts: vCharts,
        })).sort((a, b) => b.gameVersion - a.gameVersion),
      }));

      // Get the basic info from the first chart
      const firstChart = charts[0];

      // Find the first chart with BPM data
      const chartWithBpm = charts.find(c => c.bpm !== null);

      // Find the earliest added version
      const earliestAddedVersion = Math.min(...charts.map(c => c.addedVersion));

      return {
        songName: firstChart.songName,
        artist: firstChart.artist,
        cover: firstChart.cover,
        type: firstChart.type,
        genre: firstChart.genre,
        bpm: chartWithBpm?.bpm ?? null,
        addedVersion: earliestAddedVersion,
        userScores: userScoresMap,
        regions,
      } satisfies SongDetails;
    }),

  // Get simple song details for hover card (minimized payload)
  getSimpleSongDetails: publicProcedure
    .input(z.object({
      publicId: z.string(),
    }))
    .query(async ({ input }) => {
      const charts = await db
        .select({
          songName: songs.songName,
          artist: songs.artist,
          type: songs.type,
          genre: songs.genre,
          bpm: songs.bpm,
          addedVersion: songs.addedVersion,
        })
        .from(songs)
        .where(eq(songs.publicId, input.publicId));

      if (charts.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Song not found',
        });
      }

      const firstChart = charts[0];
      const chartWithBpm = charts.find(c => c.bpm !== null);
      const earliestAddedVersion = Math.min(...charts.map(c => c.addedVersion));

      const slug = await getSongSlug({
        songName: firstChart.songName,
        artist: firstChart.artist,
        type: firstChart.type,
      });

      return {
        songName: firstChart.songName,
        artist: firstChart.artist,
        type: firstChart.type,
        genre: firstChart.genre,
        bpm: chartWithBpm?.bpm ?? null,
        addedVersion: earliestAddedVersion,
        slug,
      };
    }),

});
