import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { accountsEnabled } from "@/lib/accounts/config";
import { completeLogin, sanitizeReturnTo, type PendingLogin } from "@/lib/accounts/oauth";
import { createSession, OAUTH_COOKIE, oauthCookieOptions } from "@/lib/accounts/session";
import { adoptGuestAttempts } from "@/lib/attempts";
import { getDb } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const log = logger.child({ route: "auth/callback" });

function readPending(raw: string | undefined): PendingLogin | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<PendingLogin>;
    if (
      typeof p.state !== "string" ||
      typeof p.verifier !== "string" ||
      typeof p.redirectUri !== "string"
    ) {
      return null;
    }
    return {
      state: p.state,
      verifier: p.verifier,
      returnTo: sanitizeReturnTo(p.returnTo),
      redirectUri: p.redirectUri,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const pending = readPending(req.cookies.get(OAUTH_COOKIE)?.value);

  const finish = (outcome: "ok" | "cancelled" | "failed") => {
    const target = new URL(pending?.returnTo ?? "/", req.url);
    target.searchParams.set("signin", outcome);
    const res = NextResponse.redirect(target);
    res.cookies.set(OAUTH_COOKIE, "", { ...oauthCookieOptions(), maxAge: 0 });
    return res;
  };

  const db = getDb();
  if (!accountsEnabled() || !db) return finish("failed");
  if (params.get("error")) return finish("cancelled");

  const code = params.get("code");
  if (!pending || !code || params.get("state") !== pending.state) return finish("failed");

  try {
    const identity = await completeLogin(code, pending);
    const [player] = await db
      .insert(players)
      .values({ tomomaiUserId: identity.userId, username: identity.username, image: identity.image })
      .onConflictDoUpdate({
        target: players.tomomaiUserId,
        set: { username: identity.username, image: identity.image, lastSeenAt: sql`now()` },
      })
      .returning({ id: players.id });
    if (!player) throw new Error("player upsert returned nothing");
    await createSession(player.id);
    const adopted = await adoptGuestAttempts(player.id);
    log.info({ userId: player.id, count: adopted }, "player signed in");
    return finish("ok");
  } catch (err) {
    log.error({ err }, "sign-in failed");
    return finish("failed");
  }
}
