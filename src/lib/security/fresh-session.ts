import { TRPCError } from "@trpc/server";

export const FRESH_SESSION_MAX_AGE_MS = 5 * 60 * 1000;

export const FRESH_SESSION_ERROR_CODE = "FRESH_SESSION_REQUIRED";

// Keep in sync with `socialProviders` in `src/lib/auth.ts`.
export const REAUTH_PROVIDERS = ["discord", "twitter"] as const;
export type ReauthProvider = (typeof REAUTH_PROVIDERS)[number];

function isReauthProvider(v: unknown): v is ReauthProvider {
  return typeof v === "string" && (REAUTH_PROVIDERS as readonly string[]).includes(v);
}

export function isSessionFresh(createdAt: Date | string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && Date.now() - t <= FRESH_SESSION_MAX_AGE_MS;
}

export function requireFreshSession(session: { session: { createdAt: Date | string } }): void {
  if (!isSessionFresh(session.session.createdAt)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: FRESH_SESSION_ERROR_CODE,
      cause: { code: FRESH_SESSION_ERROR_CODE },
    });
  }
}

type AuthClientLike = {
  getSession: () => Promise<unknown>;
  signIn: {
    social: (args: { provider: ReauthProvider; callbackURL: string }) => Promise<unknown>;
  };
};

type AuthClientWithList = AuthClientLike & {
  listAccounts?: () => Promise<{ data?: Array<{ providerId: string }> }>;
};

export function isFreshSessionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: unknown; cause?: unknown; data?: unknown };
  if (typeof e.message === "string" && e.message === FRESH_SESSION_ERROR_CODE) return true;
  const cause = e.cause as { code?: unknown } | undefined;
  if (cause && cause.code === FRESH_SESSION_ERROR_CODE) return true;
  const data = e.data as { code?: unknown } | undefined;
  if (data && data.code === FRESH_SESSION_ERROR_CODE) return true;
  return false;
}

function pickReauthProvider(
  accounts: Array<{ providerId: string }> | undefined,
): ReauthProvider | null {
  if (!accounts) return null;
  for (const a of accounts) {
    if (isReauthProvider(a.providerId)) return a.providerId;
  }
  return null;
}

export async function ensureFreshSessionOrReauth(
  authClient: AuthClientLike,
  primaryProvider: ReauthProvider | null | undefined,
  callbackURL: string,
): Promise<boolean> {
  const sessionRes = await authClient.getSession();
  const session = (sessionRes as { data?: { session?: { createdAt?: string | Date } } }).data;
  if (isSessionFresh(session?.session?.createdAt)) return true;
  if (isReauthProvider(primaryProvider)) {
    await authClient.signIn.social({ provider: primaryProvider, callbackURL });
  }
  return false;
}

export async function triggerReauth(
  authClient: AuthClientLike,
  callbackURL: string,
): Promise<void> {
  try {
    const list = (authClient as AuthClientWithList).listAccounts;
    const accountsRes = list ? await list() : undefined;
    const provider = pickReauthProvider(accountsRes?.data);
    if (provider) {
      await authClient.signIn.social({ provider, callbackURL });
    }
  } catch {
    // Silent — the caller's reauth-required toast already informs the user.
  }
}
