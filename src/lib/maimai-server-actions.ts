import { db } from '@/lib/db';
import { fetchMaimaiData } from '@/lib/maimai-fetcher';
import { fetchSessions, userTokens, user } from '@/lib/db/schema-pg';
import { nanoid } from 'nanoid';
import { and, desc, eq } from 'drizzle-orm';
import { encryptToken, decryptToken } from './token-crypto';
import { Region } from './types';
import { appendFetchState } from './fetch-states-server';
import { getAllStates } from './fetch-states';

export interface StartFetchResult {
  sessionId: string;
  status: 'pending';
}

export interface FetchStatusResult {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  startedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
  statusStates: string | null;
  notFoundScores: {
    songName: string;
    difficulty: string;
    musicType: string;
  }[] | null;
}

// Demo fetch
export async function demoFetch(userId: string, region: Region): Promise<StartFetchResult> {
  const fetchSessionPublicId = nanoid();
  const [insertedSession] = await db.insert(fetchSessions).values({
    publicId: fetchSessionPublicId,
    userId: userId,
    region: region,
    status: "pending",
    startedAt: new Date(),
  }).returning({ id: fetchSessions.id });

  // Simulate the fetch process
  (async () => {
    try {
      // Get all states in order from fetch-states utility
      const allStates = getAllStates();

      for (const state of allStates) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await appendFetchState(insertedSession.id, state);
      }

      // Mark as completed after all states
      await db
        .update(fetchSessions)
        .set({
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(fetchSessions.id, insertedSession.id));
    } catch (error) {
      console.error("Error during demo fetch:", error);

      // Mark as failed if error occurs
      await db
        .update(fetchSessions)
        .set({
          status: "failed",
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Unknown error occurred",
        })
        .where(eq(fetchSessions.id, insertedSession.id));
    }
  })();

  return {
    sessionId: fetchSessionPublicId,
    status: "pending" as const,
  };
}

// Extract startFetch logic from tRPC procedure
export async function startFetchServer(userId: string, region: Region, token?: string, flags: string[] = []): Promise<StartFetchResult> {
  // Check if demo mode is enabled
  if (process.env.DEMO_FETCH === 'true') {
    return demoFetch(userId, region);
  }

  let tokenToUse = token;

  // If no token provided, try to use saved token
  if (!tokenToUse) {
    const savedToken = await db
      .select({ token: userTokens.token })
      .from(userTokens)
      .where(
        and(
          eq(userTokens.userId, userId),
          eq(userTokens.region, region)
        )
      )
      .limit(1);

    if (savedToken.length === 0) {
      throw new Error('NO_TOKEN_FOUND: No authentication token found. Please add your authentication token first.');
    }

    // Decrypt the stored token
    try {
      tokenToUse = decryptToken(savedToken[0].token);
    } catch (error) {
      console.error('Failed to decrypt token:', error);
      throw new Error('Failed to decrypt stored token. Please re-add your authentication tokens.');
    }
  }

  // Store/update token if a new one was provided (do this BEFORE other checks so token is always saved)
  if (token) {
    // Encrypt the token before storing
    const encryptedToken = encryptToken(tokenToUse);

    try {
      await db
        .insert(userTokens)
        .values({
          userId: userId,
          region: region,
          token: encryptedToken,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
    } catch {
      // If insert fails due to constraint, update the existing record
      await db
        .update(userTokens)
        .set({
          token: encryptedToken,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userTokens.userId, userId),
            eq(userTokens.region, region)
          )
        );
    }
  }

  // Check if user has set their album preference
  const userPreference = await db
    .select({ fetchUseAlbums: user.fetchUseAlbums })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (userPreference.length === 0 || userPreference[0].fetchUseAlbums === null) {
    throw new Error('NO_USE_ALBUMS_SETTINGS: No fetch albums settings preference set. Please set this option on the website by fetching once first.');
  }

  // Store the preference to pass to fetch logic later
  const shouldFetchAlbums = userPreference[0].fetchUseAlbums;

  // Check for existing pending fetch
  const existingFetch = await db
    .select()
    .from(fetchSessions)
    .where(
      and(
        eq(fetchSessions.userId, userId),
        eq(fetchSessions.region, region),
        eq(fetchSessions.status, "pending")
      )
    );

  if (existingFetch.length > 0) {
    const threeMinutes = 3 * 60 * 1000; // 3 minutes in milliseconds
    const now = Date.now();

    // Check if any pending fetches are older than 3 minutes
    const oldFetches = existingFetch.filter(
      fetch => now - fetch.startedAt.getTime() > threeMinutes
    );

    if (oldFetches.length > 0) {
      // Mark old pending fetches as failed due to timeout
      for (const oldFetch of oldFetches) {
        await db
          .update(fetchSessions)
          .set({
            status: "failed",
            completedAt: new Date(),
            errorMessage: "Fetch timed out after 3 minutes",
          })
          .where(eq(fetchSessions.id, oldFetch.id));
      }
    }

    // Check if there are still any recent pending fetches
    const recentPendingFetches = existingFetch.filter(
      fetch => now - fetch.startedAt.getTime() <= threeMinutes
    );

    if (recentPendingFetches.length > 0) {
      throw new Error('A fetch is already in progress for this region');
    }
  }

  // Check rate limit (5 requests per 5 minutes)
  const recentFetches = await db
    .select()
    .from(fetchSessions)
    .where(
      and(
        eq(fetchSessions.userId, userId),
        eq(fetchSessions.region, region)
      )
    )
    .orderBy(desc(fetchSessions.startedAt))
    .limit(5);

  if (recentFetches.length >= 5) {
    // Check if the 5th most recent fetch is within the last 5 minutes
    const fifthMostRecentFetch = recentFetches[4]; // 0-indexed, so 4th index is 5th item
    const timeSinceOldestInWindow = Date.now() - fifthMostRecentFetch.startedAt.getTime();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (timeSinceOldestInWindow < fiveMinutes) {
      const remainingTime = Math.ceil((fiveMinutes - timeSinceOldestInWindow) / 1000);
      throw new Error(`Rate limited. You can make 5 requests per 5 minutes. Try again in ${remainingTime} seconds.`);
    }
  }

  // Create fetch session with dual ID system
  const fetchSessionPublicId = nanoid();
  const [insertedSession] = await db.insert(fetchSessions).values({
    publicId: fetchSessionPublicId,
    userId: userId,
    region: region,
    status: "pending",
    startedAt: new Date(),
  }).returning({ id: fetchSessions.id });

  const fetchSessionInternalId = insertedSession.id;

  // Start the actual data fetch in the background
  (async () => {
    try {
      // Create a timeout promise (2 minutes)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Fetch operation timed out after 2 minutes'));
        }, 2 * 60 * 1000); // 2 minutes in milliseconds
      });

      // Race between the actual fetch and the timeout
      await Promise.race([
        fetchMaimaiData(userId, region, fetchSessionInternalId, flags, shouldFetchAlbums),
        timeoutPromise
      ]);

      // Mark fetch as completed
      await db
        .update(fetchSessions)
        .set({
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(fetchSessions.id, fetchSessionInternalId));
    } catch (error) {
      console.error("Error during maimai data fetch:", error);

      // Mark fetch as failed
      await db
        .update(fetchSessions)
        .set({
          status: "failed",
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Unknown error occurred",
        })
        .where(eq(fetchSessions.id, fetchSessionInternalId));
    }
  })();

  return {
    sessionId: fetchSessionPublicId,
    status: "pending" as const,
  };
}

// Extract getFetchStatus logic from tRPC procedure
export async function getFetchStatusServer(userId: string, region: Region): Promise<FetchStatusResult | null> {
  const fetchSession = await db
    .select({
      id: fetchSessions.publicId, // Return publicId as id for external-facing API
      status: fetchSessions.status,
      startedAt: fetchSessions.startedAt,
      completedAt: fetchSessions.completedAt,
      errorMessage: fetchSessions.errorMessage,
      statusStates: fetchSessions.statusStates,
      extraData: fetchSessions.extraData,
    })
    .from(fetchSessions)
    .where(
      and(
        eq(fetchSessions.userId, userId),
        eq(fetchSessions.region, region)
      )
    )
    .orderBy(desc(fetchSessions.startedAt))
    .limit(1);

  if (fetchSession.length === 0) {
    return null; // No fetch sessions found
  }

  const session = fetchSession[0];
  return {
    id: session.id, // publicId
    status: session.status as 'pending' | 'completed' | 'failed',
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    errorMessage: session.errorMessage,
    statusStates: session.statusStates,
    notFoundScores: typeof session.extraData === "object" && session.extraData !== null && "notFoundScores" in session.extraData ? (session.extraData as { notFoundScores?: { songName: string; difficulty: string; musicType: string }[] }).notFoundScores ?? null : null,
  };
}
