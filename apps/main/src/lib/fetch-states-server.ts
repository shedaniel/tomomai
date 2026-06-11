import { db } from "./db";
import { fetchSessions } from "./db/schema-pg";
import { getLogger } from "./request-logger";
import { eq } from "drizzle-orm";
import {
  FetchState,
  parseStatusStates,
  serializeStatusStates,
  calculateProgress
} from "./fetch-states";

// Lock mechanism to prevent race conditions when updating session states
const sessionLocks = new Map<string, Promise<void>>();

// Helper function to append a state to statusStates (non-blocking)
export async function appendFetchState(sessionId: bigint, state: FetchState): Promise<void> {
  // Serialize updates per sessionId to prevent race conditions
  const lockKey = sessionId.toString();
  const lockPromise = sessionLocks.get(lockKey) || Promise.resolve();

  const newLockPromise = lockPromise.then(async () => {
    try {
      // First get the current statusStates
      const currentSession = await db
        .select({ statusStates: fetchSessions.statusStates })
        .from(fetchSessions)
        .where(eq(fetchSessions.id, sessionId))
        .limit(1);

      if (currentSession.length === 0) {
        getLogger().warn({ sessionId }, `Session not found when trying to append state ${state}`);
        return;
      }

      const currentStates = parseStatusStates(currentSession[0].statusStates);

      // Only add if not already present
      if (!currentStates.includes(state)) {
        const newStates = [...currentStates, state];
        const newStatusStates = serializeStatusStates(newStates);

        await db
          .update(fetchSessions)
          .set({ statusStates: newStatusStates })
          .where(eq(fetchSessions.id, sessionId));

        getLogger().debug(`Appended state '${state}' to session ${sessionId}. Progress: ${calculateProgress(newStates)}%`);
      }
    } catch (error) {
      // Non-blocking - just log the error and continue
      getLogger().error({ err: error }, `Failed to append state '${state}' to session ${sessionId}`);
    }
  }).finally(() => {
    // Clean up the lock if it's the current one
    if (sessionLocks.get(lockKey) === newLockPromise) {
      sessionLocks.delete(lockKey);
    }
  });

  sessionLocks.set(lockKey, newLockPromise);
  return newLockPromise;
}
