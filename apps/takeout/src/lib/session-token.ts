import { cookies } from "next/headers";
import { requireOAuthClient, resolveTomomaiApiBase } from "./env";
import { refreshAccessToken } from "./oauth";
import { SESSION_COOKIE, type TakeoutSession, unsealSession } from "./session";

export async function readSessionFromCookies(): Promise<TakeoutSession | null> {
  const cookieStore = await cookies();
  const sealed = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sealed) return null;

  return unsealSession(sealed);
}

export async function refreshSessionIfNeeded(session: TakeoutSession): Promise<{
  session: TakeoutSession;
  refreshed: boolean;
}> {
  if (session.expiresAt > Date.now() + 60_000) {
    return { session, refreshed: false };
  }

  if (!session.refreshToken) {
    throw new Error("Session has no refresh token");
  }

  const { clientId, clientSecret } = requireOAuthClient();
  const token = await refreshAccessToken({
    apiBase: resolveTomomaiApiBase(),
    clientId,
    clientSecret,
    refreshToken: session.refreshToken,
  });

  return {
    refreshed: true,
    session: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000,
      scope: token.scope,
    },
  };
}
