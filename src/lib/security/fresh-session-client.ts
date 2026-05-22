"use client";

import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
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
      });
    }
  } catch {
    // Silent — the caller's reauth-required toast already informs the user.
  }
}

export interface ReauthGuardOptions {
  callbackURL: string;
  reauthMessage: string;
  fallback: string;
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
export function reauthGuard(opts: ReauthGuardOptions) {
  return {
    onMutate: async () => {
      const sessionRes = await authClient.getSession();
      const session = (sessionRes as { data?: { session?: { createdAt?: string | Date } } }).data;
      if (!isSessionFresh(session?.session?.createdAt)) {
        toast.error(opts.reauthMessage);
        void triggerReauth(opts.callbackURL);
        throw new Error(FRESH_LOCAL_STALE);
      }
    },
    onError: (err: { message?: string }) => {
      if (err.message === FRESH_LOCAL_STALE) return;
      if (isFreshSessionError(err)) {
        toast.error(opts.reauthMessage);
        void triggerReauth(opts.callbackURL);
        return;
      }
      toast.error(err.message || opts.fallback);
    },
  };
}
