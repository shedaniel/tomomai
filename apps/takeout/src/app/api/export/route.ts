import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveBaseUrl } from "@/lib/base-url";
import { resolveTomomaiApiBase } from "@/lib/env";
import { readSessionFromCookies, refreshSessionIfNeeded } from "@/lib/session-token";
import { SESSION_COOKIE, sealSession, sessionCookieOptions } from "@/lib/session";
import { collectTakeoutExport, isApiAuthError, REGIONS, type Region } from "@/lib/tomomai-api";

function notAuthenticated(baseUrl: string): NextResponse {
  const response = NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(baseUrl), maxAge: 0 });
  return response;
}

function selectedRegions(value: string | null): readonly Region[] | null {
  if (!value || value === "all") return REGIONS;
  if (REGIONS.includes(value as Region)) return [value as Region];
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const baseUrl = resolveBaseUrl();
  const session = await readSessionFromCookies();
  if (!session) return notAuthenticated(baseUrl);

  const regions = selectedRegions(request.nextUrl.searchParams.get("region"));
  if (!regions) return NextResponse.json({ error: "invalid_region" }, { status: 400 });

  try {
    const refreshed = await refreshSessionIfNeeded(session);
    const exportPayload = await collectTakeoutExport({
      apiBase: resolveTomomaiApiBase(),
      accessToken: refreshed.session.accessToken,
      regions,
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const response = new NextResponse(JSON.stringify(exportPayload, null, 2) + "\n", {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="tomomai-takeout-${timestamp}.json"`,
        "Cache-Control": "no-store",
      },
    });

    if (refreshed.refreshed) {
      response.cookies.set(
        SESSION_COOKIE,
        await sealSession(refreshed.session),
        sessionCookieOptions(baseUrl),
      );
    }

    return response;
  } catch (error) {
    if (isApiAuthError(error)) return notAuthenticated(baseUrl);
    return NextResponse.json({ error: "export_failed" }, { status: 502 });
  }
}
