import { NextResponse } from "next/server";
import { resolveBaseUrl } from "@/lib/base-url";
import { resolveTomomaiApiBase } from "@/lib/env";
import { readSessionFromCookies, refreshSessionIfNeeded } from "@/lib/session-token";
import { fetchApiJson } from "@/lib/tomomai-api";
import { SESSION_COOKIE, sealSession, sessionCookieOptions } from "@/lib/session";

function unauthorizedResponse(baseUrl: string): NextResponse {
  const response = NextResponse.json({ authenticated: false }, { status: 401 });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(baseUrl), maxAge: 0 });
  return response;
}

export async function GET(): Promise<NextResponse> {
  const baseUrl = resolveBaseUrl();
  const session = await readSessionFromCookies();
  if (!session) return unauthorizedResponse(baseUrl);

  try {
    const refreshed = await refreshSessionIfNeeded(session);
    const me = await fetchApiJson<unknown>(
      resolveTomomaiApiBase(),
      refreshed.session.accessToken,
      "/api/v1/me",
    );
    const response = NextResponse.json({
      authenticated: true,
      me,
      scope: refreshed.session.scope,
    });

    if (refreshed.refreshed) {
      response.cookies.set(
        SESSION_COOKIE,
        await sealSession(refreshed.session),
        sessionCookieOptions(baseUrl),
      );
    }

    return response;
  } catch {
    return unauthorizedResponse(baseUrl);
  }
}
