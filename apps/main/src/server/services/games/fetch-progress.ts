import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { fetchSessions } from "@/lib/db/schema-pg";
import { calculateProgress, parseStatusStates, serializeStatusStates, type FetchState } from "@/lib/fetch-states";
import { logger } from "@/lib/logger";

const sessionLocks = new Map<string, Promise<void>>();

/** Records a completed stage in a pending session's progress. Failures are logged, never thrown. */
export async function appendFetchState(sessionId: bigint, state: FetchState): Promise<void> {
  const id = sessionId.toString();
  const pendingSession = and(eq(fetchSessions.id, sessionId), eq(fetchSessions.status, "pending"));

  // Stages of one fetch finish concurrently, and each rewrites the whole list.
  const previous = sessionLocks.get(id) ?? Promise.resolve();
  const current = previous.then(async () => {
    try {
      const [session] = await db
        .select({ statusStates: fetchSessions.statusStates, game: fetchSessions.game })
        .from(fetchSessions)
        .where(pendingSession)
        .limit(1);

      if (!session) {
        logger.warn({ state }, `Fetch session row ${id} not found or no longer pending`);
        return;
      }

      const currentStates = parseStatusStates(session.statusStates);
      if (currentStates.includes(state)) return;

      const newStates = [...currentStates, state];
      await db
        .update(fetchSessions)
        .set({ statusStates: serializeStatusStates(newStates) })
        .where(pendingSession);
      logger.debug({ state, progress: calculateProgress(newStates, session.game) }, `Appended fetch state to session row ${id}`);
    } catch (err) {
      logger.error({ err, state }, `Failed to append fetch state to session row ${id}`);
    }
  }).finally(() => {
    if (sessionLocks.get(id) === current) sessionLocks.delete(id);
  });

  sessionLocks.set(id, current);
  return current;
}
