export const FRESH_SESSION_MAX_AGE_MS = 5 * 60 * 1000;

export const FRESH_SESSION_ERROR_CODE = "FRESH_SESSION_REQUIRED";

// Keep in sync with `socialProviders` in `src/lib/auth.ts`.
export const REAUTH_PROVIDERS = ["discord", "twitter"] as const;
export type ReauthProvider = (typeof REAUTH_PROVIDERS)[number];

export function isReauthProvider(v: unknown): v is ReauthProvider {
  return typeof v === "string" && (REAUTH_PROVIDERS as readonly string[]).includes(v);
}

export function isSessionFresh(createdAt: Date | string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && Date.now() - t <= FRESH_SESSION_MAX_AGE_MS;
}

export function pickReauthProvider(
  accounts: Array<{ providerId: string }> | undefined,
): ReauthProvider | null {
  if (!accounts) return null;
  for (const a of accounts) {
    if (isReauthProvider(a.providerId)) return a.providerId;
  }
  return null;
}

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
