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
   * Runs one step of the fetch unless it has been aborted, logs its duration, and records
   * `completes` in the session's progress once the step succeeds. A failure is rethrown as a
   * FetchStageError naming the step, and the fetch logs it once.
   */
  stage<T>(stepType: string, work: () => Promise<T>, completes?: FetchState): Promise<T>;
};

/** A failed fetch stage. It keeps the original error's message, which the session stores. */
export class FetchStageError extends Error {
  constructor(
    public readonly stepType: string,
    public readonly durationMs: number,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "FetchStageError";
  }
}

/** The error that failed a fetch, with the stage it failed in when a stage threw it. */
export function fetchFailure(error: unknown): { err: unknown; stepType?: string; durationMs?: number } {
  return error instanceof FetchStageError
    ? { err: error.cause, stepType: error.stepType, durationMs: error.durationMs }
    : { err: error };
}

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
        if (completes) await appendFetchState(sessionId, completes);
        return result;
      } catch (err) {
        // Once aborted, the abort reason is the failure the fetch reports, not this stage.
        if (signal.aborted) throw err;
        throw new FetchStageError(stepType, Date.now() - startedAt, err);
      }
    },
  };
}
