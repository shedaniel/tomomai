import { TRPCError } from "@trpc/server";

export const FRESH_SESSION_MAX_AGE_MS = 5 * 60 * 1000;

export function isSessionFresh(createdAt: Date | string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && Date.now() - t <= FRESH_SESSION_MAX_AGE_MS;
}

export function requireFreshSession(session: { session: { createdAt: Date | string } }): void {
  if (!isSessionFresh(session.session.createdAt)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "FRESH_SESSION_REQUIRED" });
  }
}

type SocialProvider = "discord" | "twitter";

type AuthClientLike = {
  getSession: () => Promise<unknown>;
  signIn: {
    social: (args: { provider: SocialProvider; callbackURL: string }) => Promise<unknown>;
  };
};

// Detects the FRESH_SESSION_REQUIRED error thrown by tRPC routes / BA endpoints
// so callers can route to a reauth flow uniformly.
export function isFreshSessionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && message.includes("FRESH_SESSION_REQUIRED");
}

export async function ensureFreshSessionOrReauth(
  authClient: AuthClientLike,
  primaryProvider: SocialProvider | null | undefined,
  callbackURL: string,
): Promise<boolean> {
  const sessionRes = await authClient.getSession();
  const session = (sessionRes as { data?: { session?: { createdAt?: string | Date } } }).data;
  if (isSessionFresh(session?.session?.createdAt)) return true;
  if (primaryProvider === "discord" || primaryProvider === "twitter") {
    await authClient.signIn.social({ provider: primaryProvider, callbackURL });
  }
  return false;
}

// Kick off reauth via the user's primary linked provider. Best-effort: if no
// social provider is linked, the caller's toast message remains the user's cue
// to sign back in manually.
export async function triggerReauth(
  authClient: AuthClientLike,
  callbackURL: string,
): Promise<void> {
  try {
    const accountsRes = await (authClient as unknown as { listAccounts: () => Promise<{ data?: Array<{ providerId: string }> }> }).listAccounts?.();
    const primary = accountsRes?.data?.[0]?.providerId as SocialProvider | undefined;
    if (primary === "discord" || primary === "twitter") {
      await authClient.signIn.social({ provider: primary, callbackURL });
    }
  } catch {
    // Silent — the caller's reauth-required toast already informs the user.
  }
}
