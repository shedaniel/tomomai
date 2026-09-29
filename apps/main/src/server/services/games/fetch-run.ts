import "server-only";
import type { Logger } from "pino";
import type { FetchState } from "@/lib/fetch-states";
import { appendFetchState } from "@/lib/fetch-states-server";
import { getLogger } from "@/lib/request-logger";
import type { ScoreFetchContext } from "./types";

export type FetchRun = {
  /** Carries the fetch's game, region, user and session. */
  log: Logger;
  /**
   * Runs one step of the fetch unless it has been aborted, logs its duration or failure,
   * and records `completes` in the session's progress once the step succeeds.
   */
  stage<T>(stepType: string, work: () => Promise<T>, completes?: FetchState): Promise<T>;
};

export function createFetchRun(ctx: ScoreFetchContext): FetchRun {
  const { game, region, userId, sessionId, signal } = ctx;
  const log = getLogger().child({ game, region, userId, sessionId: sessionId.toString() });
  return {
    log,
    async stage(stepType, work, completes) {
      signal.throwIfAborted();
      const startedAt = Date.now();
      try {
        const result = await work();
        signal.throwIfAborted();
        log.info({ stepType, durationMs: Date.now() - startedAt }, "Fetch stage completed");
        if (completes) await appendFetchState(sessionId, completes, game);
        return result;
      } catch (err) {
        log.warn({ err, stepType, durationMs: Date.now() - startedAt }, "Fetch stage failed");
        throw err;
      }
    },
  };
}
