"use client";

import { useTranslations } from "next-intl";
import { ensureFreshSession, reauthGuard } from "./fresh-session-client";

export interface UseReauthGuardOptions {
  callbackURL: string;
  reauthMessage: string;
  fallback?: string;
  errorMessages?: Record<string, string>;
}

/**
 * Hook wrapper around `reauthGuard` that injects shared confirm-dialog strings
 * from `common.*` and `security.reauth.*`. Spread into a mutation:
 *
 *   const m = useMutation({
 *     mutationFn,
 *     ...useReauthGuard({ callbackURL, reauthMessage }),
 *     onSuccess,
 *   });
 */
export function useReauthGuard(opts: UseReauthGuardOptions) {
  const c = useTranslations("common");
  const r = useTranslations("security.reauth");
  return reauthGuard({
    ...opts,
    title: r("title"),
    description: r("description"),
    confirmLabel: c("continue"),
    cancelLabel: c("cancel"),
  });
}

/**
 * Returns a check to run before opening a form that needs a fresh session. Pass the URL to come back
 * to after reauth, ideally one that reopens the form.
 */
export function useEnsureFreshSession(reauthMessage: string) {
  const c = useTranslations("common");
  const r = useTranslations("security.reauth");
  return (callbackURL: string) =>
    ensureFreshSession({
      callbackURL,
      reauthMessage,
      title: r("title"),
      description: r("description"),
      confirmLabel: c("continue"),
      cancelLabel: c("cancel"),
    });
}
