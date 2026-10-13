"use client";

import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { showConfirm } from "@/components/imperative-dialog";
import {
  isFreshSessionError,
  isSessionFresh,
  pickReauthProvider,
  type ReauthProvider,
} from "./fresh-session";

const FRESH_LOCAL_STALE = "__fresh_session_local_stale__";

async function triggerReauth(callbackURL: string): Promise<void> {
  try {
    const accountsRes = await authClient.listAccounts();
    const provider = pickReauthProvider(
      accountsRes.data as Array<{ providerId: string }> | undefined,
    );
    if (provider) {
      await authClient.signIn.social({
        provider: provider as ReauthProvider,
        callbackURL,
        errorCallbackURL: callbackURL,
      });
    }
  } catch {
    // Silent — the caller's reauth-required toast already informs the user.
  }
}

export interface ReauthGuardOptions {
  callbackURL: string;
  reauthMessage: string;
  /** Optional toast message when a non-reauth error arrives without `err.message`. */
  fallback?: string;
  /** Translated toasts for server error codes, such as a limit being reached. */
  errorMessages?: Record<string, string>;
  /** Confirm dialog strings — caller pre-translates since this module is React-context-free. */
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
}

/**
 * Returns mutation-hook options that pre-flight a session-freshness check and
 * route stale-session errors through an OAuth reauth bounce.
 *
 * Spread into any `useMutation` or tRPC `useMutation` call:
 *   const m = trpc.foo.bar.useMutation({
 *     ...reauthGuard({ callbackURL, reauthMessage, fallback }),
 *     onSuccess: () => ...,
 *   });
 *
 * Pre-flight (`onMutate`) avoids a wasted server round-trip and prevents
 * side-effecting flows (popups, navigation) from half-firing on a stale
 * session. The server-side check remains belt-and-braces for clock skew /
 * cross-tab expiry between pre-flight and request.
 */
type ReauthPrompt = Omit<ReauthGuardOptions, "fallback" | "errorMessages">;

async function promptThenReauth(opts: ReauthPrompt) {
  const ok = await showConfirm({
    title: opts.title,
    description: opts.description,
    confirmLabel: opts.confirmLabel,
    cancelLabel: opts.cancelLabel,
    dedupKey: "fresh-session:reauth",
  });
  if (ok) {
    toast.error(opts.reauthMessage);
    void triggerReauth(opts.callbackURL);
  }
}

async function hasFreshSession() {
  const sessionRes = await authClient.getSession();
  const session = (sessionRes as { data?: { session?: { createdAt?: string | Date } } }).data;
  return isSessionFresh(session?.session?.createdAt);
}

/**
 * Checks freshness before a form opens, so the reauth bounce happens before the user types anything.
 * Resolves true when the session is fresh. Otherwise offers reauth back to `callbackURL` and resolves false.
 */
export async function ensureFreshSession(opts: ReauthPrompt): Promise<boolean> {
  if (await hasFreshSession()) return true;
  await promptThenReauth(opts);
  return false;
}

export function reauthGuard(opts: ReauthGuardOptions) {
  return {
    onMutate: async () => {
      if (!(await hasFreshSession())) {
        await promptThenReauth(opts);
        throw new Error(FRESH_LOCAL_STALE);
      }
    },
    onError: async (err: { message?: string }) => {
      if (err.message === FRESH_LOCAL_STALE) return;
      if (isFreshSessionError(err)) {
        await promptThenReauth(opts);
        return;
      }
      toast.error((err.message && opts.errorMessages?.[err.message]) || err.message || opts.fallback);
    },
  };
}
