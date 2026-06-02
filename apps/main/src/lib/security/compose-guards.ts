"use client";

/**
 * Compose multiple mutation guards (each providing `onMutate` / `onError`) into
 * a single `{ onMutate, onError }` pair to spread into a `useMutation`.
 *
 * - `onMutate` runs each guard's `onMutate` in order. If any throws, the mutation
 *   is aborted (later guards do not run). Put the guard that should prompt first
 *   (e.g. policy acceptance) ahead of one that navigates away (e.g. reauth).
 * - `onError` runs each guard's `onError` in order until one returns a truthy
 *   "handled" value. Put a terminal guard (one that always toasts) last.
 */
type GuardHandlers = {
  onMutate?: (...args: unknown[]) => unknown | Promise<unknown>;
  onError?: (err: { message?: string }, ...args: unknown[]) => unknown | Promise<unknown>;
};

export function composeGuards(...guards: GuardHandlers[]) {
  return {
    onMutate: async (...args: unknown[]) => {
      for (const g of guards) {
        if (g.onMutate) await g.onMutate(...args);
      }
    },
    onError: async (err: { message?: string }, ...args: unknown[]) => {
      for (const g of guards) {
        if (g.onError) {
          const handled = await g.onError(err, ...args);
          if (handled) return;
        }
      }
    },
  };
}
