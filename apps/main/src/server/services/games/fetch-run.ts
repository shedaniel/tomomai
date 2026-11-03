import "server-only";
import type { FetchState } from "@/lib/fetch-states";
import { appendFetchState } from "./fetch-progress";
import type { ScoreFetchContext } from "./types";
import { logger } from "@/lib/logger";

export type FetchRun = {
  /**
   * Runs one step of the fetch unless it has been aborted, logs its duration, and records
   * `completes` in the session's progress once the step succeeds. A failure is rethrown as a
   * FetchStageError naming the step, and the fetch logs it once.
   */
  stage<T>(stepType: string, work: () => Promise<T>, completes?: FetchState): Promise<T>;
  /** Runs `cleanup` once the fetch settles, after its enrichment when it has one, whether or not it succeeded. */
  defer(cleanup: () => void): void;
};

export type SettlingFetchRun = FetchRun & {
  /** Runs the deferred cleanups. */
  settle(): void;
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

export function createFetchRun(ctx: ScoreFetchContext): SettlingFetchRun {
  const { sessionId, signal } = ctx;
  const cleanups: (() => void)[] = [];
  return {
    defer(cleanup) {
      cleanups.push(cleanup);
    },
    settle() {
      for (const cleanup of cleanups.splice(0)) {
        try {
          cleanup();
        } catch (err) {
          logger.error({ err }, "Fetch cleanup failed");
        }
      }
    },
    async stage(stepType, work, completes) {
      signal.throwIfAborted();
      const startedAt = Date.now();
      try {
        const result = await work();
        signal.throwIfAborted();
        logger.info({ stepType, durationMs: Date.now() - startedAt }, "Fetch stage completed");
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
