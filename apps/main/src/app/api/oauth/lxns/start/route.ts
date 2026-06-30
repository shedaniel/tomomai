import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getServerSession } from "@/lib/auth-server";
import { resolveBaseUrlFromHeaders } from "@/lib/base-url";
import { requestLogger } from "@/lib/request-logger";

const AUTHORIZE_URL = "https://maimai.lxns.net/oauth/authorize";
const SCOPES = ["read_player", "read_user_profile"];
const STATE_COOKIE = "lxns_oauth_state";
const STATE_TTL_SECONDS = 600;

export async function GET(req: NextRequest) {
  const { log } = requestLogger(req, "oauth/lxns/start");
  const clientId = process.env.LXNS_CLIENT_ID;
  const clientSecret = process.env.LXNS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    log.warn("start blocked: env vars not configured");
    return NextResponse.json(
      { error: "lxns_oauth_not_configured" },
      { status: 503 }
    );
  }

  const session = await getServerSession();
  if (!session?.user) {
    log.warn("start blocked: no session");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const baseUrl = resolveBaseUrlFromHeaders(req.headers);
  const redirectUri =
    process.env.LXNS_REDIRECT_URI || `${baseUrl}/api/oauth/lxns/callback`;
  const state = nanoid(32);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    state,
  });
  const authorizeUrl = `${AUTHORIZE_URL}?${params.toString()}`;

  log.info(
    { userId: session.user.id, redirectUri, scopes: SCOPES.join(",") },
    "start: redirecting to authorize",
  );

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(STATE_COOKIE, `${session.user.id}:${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: baseUrl.startsWith("https://"),
    path: "/api/oauth/lxns",
    maxAge: STATE_TTL_SECONDS,
  });
  return res;
}
