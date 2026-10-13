import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "../db";
import { playerSessions, players, type PlayerRow } from "../db/schema";
import { accountsEnabled } from "./config";

export const SESSION_COOKIE = "guess_session";
export const GUEST_COOKIE = "guess_guest";
export const OAUTH_COOKIE = "guess_oauth";

const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const GUEST_TTL_SEC = 400 * 24 * 60 * 60;

const secure = process.env.NODE_ENV === "production";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(playerId: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("database unavailable");
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(playerSessions).values({ tokenHash: hashToken(token), playerId, expiresAt });
  // Opportunistic cleanup keeps the table from accumulating dead rows.
  await db.delete(playerSessions).where(lt(playerSessions.expiresAt, new Date()));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  jar.delete(SESSION_COOKIE);
  const db = getDb();
  if (!token || !db) return;
  await db.delete(playerSessions).where(eq(playerSessions.tokenHash, hashToken(token)));
}

/** The signed-in player, or null when signed out or accounts are disabled. */
export async function getPlayer(): Promise<PlayerRow | null> {
  if (!accountsEnabled()) return null;
  const db = getDb();
  if (!db) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ player: players })
    .from(playerSessions)
    .innerJoin(players, eq(players.id, playerSessions.playerId))
    .where(
      and(eq(playerSessions.tokenHash, hashToken(token)), gt(playerSessions.expiresAt, new Date())),
    )
    .limit(1);
  return row?.player ?? null;
}

export async function readGuestId(): Promise<string | null> {
  const value = (await cookies()).get(GUEST_COOKIE)?.value;
  return value && /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null;
}

export async function ensureGuestId(): Promise<string> {
  const existing = await readGuestId();
  if (existing) return existing;
  const id = randomToken(18);
  (await cookies()).set(GUEST_COOKIE, id, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_TTL_SEC,
  });
  return id;
}

export function oauthCookieOptions() {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/api/auth", maxAge: 600 };
}
