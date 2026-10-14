"use client";

import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { showDialog } from "@/components/imperative-dialog";
import { DEV_REAUTH_PATH } from "@/lib/dev-reauth-path";
import {
  isFreshSessionError,
  isReauthProvider,
  isSessionFresh,
  type ReauthProvider,
} from "./fresh-session";

const FRESH_LOCAL_STALE = "__fresh_session_local_stale__";

export type ReauthMethod = ReauthProvider | "passkey" | "dev";

/** Every way this account can prove it's still the same person, in the order the dialog offers them. */
async function availableMethods(): Promise<ReauthMethod[]> {
  const [accounts, passkeys] = await Promise.all([
    authClient.listAccounts().catch(() => null),
    authClient.passkey.listUserPasskeys().catch(() => null),
  ]);
  const methods: ReauthMethod[] = [];
  for (const a of (accounts?.data as Array<{ providerId: string }> | undefined) ?? []) {
    if (isReauthProvider(a.providerId) && !methods.includes(a.providerId)) methods.push(a.providerId);
  }
  if ((passkeys?.data as unknown[] | undefined)?.length) methods.push("passkey");
  if (process.env.NODE_ENV === "development") methods.push("dev");
  return methods;
}

async function currentUserId(): Promise<string | undefined> {
  const res = await authClient.getSession();
  return (res as { data?: { user?: { id?: string } } }).data?.user?.id;
}

/** Passkey and dev reauth mint a new session in place, so finish by going back like a social bounce would. */
async function reauthInPlace(method: "passkey" | "dev", callbackURL: string): Promise<boolean> {
  const before = await currentUserId();
  const result =
    method === "passkey"
      ? await authClient.signIn.passkey()
      : await authClient.$fetch(DEV_REAUTH_PATH, { method: "POST", body: {} });
  if (result.error) return false;
  // The passkey prompt only offers this account's own passkeys, but never carry on as someone else.
  if ((await currentUserId()) !== before) return false;
  window.location.assign(callbackURL);
  return true;
}

async function triggerReauth(method: ReauthMethod, opts: ReauthPrompt): Promise<void> {
  try {
    if (method === "passkey" || method === "dev") {
      if (!(await reauthInPlace(method, opts.callbackURL))) toast.error(opts.failedMessage);
      return;
    }
    toast.error(opts.reauthMessage);
    await authClient.signIn.social({
      provider: method,
      callbackURL: opts.callbackURL,
      errorCallbackURL: opts.callbackURL,
    });
  } catch {
    toast.error(opts.failedMessage);
  }
}

export interface ReauthGuardOptions {
  callbackURL: string;
  reauthMessage: string;
  /** Optional toast message when a non-reauth error arrives without `err.message`. */
  fallback?: string;
  /** Translated toasts for server error codes, such as a limit being reached. */
  errorMessages?: Record<string, string>;
  /** Dialog strings. The caller pre-translates since this module is React-context-free. */
  title: string;
  description: string;
  /** Shown when the account has no method this dialog can offer. */
  noMethodDescription: string;
  methodLabels: Record<ReauthMethod, string>;
  signOutLabel: string;
  failedMessage: string;
  cancelLabel: string;
}

/**
 * Returns mutation-hook options that pre-flight a session-freshness check and
 * route stale-session errors through the reauth dialog.
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
  const methods = await availableMethods();
  const choice = await showDialog<ReauthMethod | "signOut" | null>({
    title: opts.title,
    description: methods.length ? opts.description : opts.noMethodDescription,
    actions: [
      ...methods.map((m, i) => ({
        label: opts.methodLabels[m],
        value: m,
        variant: i === 0 ? ("default" as const) : ("outline" as const),
      })),
      ...(methods.length ? [] : [{ label: opts.signOutLabel, value: "signOut" as const }]),
      { label: opts.cancelLabel, value: null, variant: "ghost" as const },
    ],
    dismissValue: null,
    dedupKey: "fresh-session:reauth",
  });
  if (choice === "signOut") {
    await authClient.signOut();
    window.location.assign(opts.callbackURL);
  } else if (choice) {
    await triggerReauth(choice, opts);
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
