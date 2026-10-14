"use client";

import { useTranslations } from "next-intl";
import { ensureFreshSession, reauthGuard } from "./fresh-session-client";

export interface UseReauthGuardOptions {
  callbackURL: string;
  reauthMessage: string;
  fallback?: string;
  errorMessages?: Record<string, string>;
}

function useReauthStrings() {
  const c = useTranslations("common");
  const r = useTranslations("security.reauth");
  return {
    title: r("title"),
    description: r("description"),
    noMethodDescription: r("noMethod"),
    methodLabels: {
      discord: r("methods.discord"),
      twitter: r("methods.twitter"),
      passkey: r("methods.passkey"),
      dev: r("methods.dev"),
    },
    signOutLabel: r("signOut"),
    failedMessage: r("failed"),
    cancelLabel: c("cancel"),
  };
}

/**
 * Hook wrapper around `reauthGuard` that injects the shared reauth dialog strings
 * from `common.*` and `security.reauth.*`. Spread into a mutation:
 *
 *   const m = useMutation({
 *     mutationFn,
 *     ...useReauthGuard({ callbackURL, reauthMessage }),
 *     onSuccess,
 *   });
 */
export function useReauthGuard(opts: UseReauthGuardOptions) {
  return reauthGuard({ ...opts, ...useReauthStrings() });
}

/**
 * Returns a check to run before opening a form that needs a fresh session. Pass the URL to come back
 * to after reauth, ideally one that reopens the form.
 */
export function useEnsureFreshSession(reauthMessage: string) {
  const strings = useReauthStrings();
  return (callbackURL: string) => ensureFreshSession({ callbackURL, reauthMessage, ...strings });
}
