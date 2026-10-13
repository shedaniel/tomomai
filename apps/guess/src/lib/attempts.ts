import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { cookies } from "next/headers";
import { accountsEnabled } from "./accounts/config";
import { ensureGuestId, getPlayer, GUEST_COOKIE, readGuestId } from "./accounts/session";
import { isCalendarKey } from "./day";
import { getDb } from "./db";
import { attempts, type AttemptRow, type AttemptStatus } from "./db/schema";
import { getMode } from "./heardle-config";
import type { StepResult } from "./progress";
import { HINT_COUNT } from "./types";

export type Owner = { playerId: string } | { guestId: string };

/** What the client needs to reconcile its local progress with the server. */
export type AttemptState = { results: StepResult[]; status: AttemptStatus };

const STEP_RESULTS = new Set<StepResult>(["correct", "incorrect", "skipped"]);

export function isTracked(dateKey: string): boolean {
  return accountsEnabled() && getDb() !== null && isCalendarKey(dateKey);
}

/** Player when signed in, otherwise the guest cookie (minted when `create`). */
export async function resolveOwner(create: boolean): Promise<Owner | null> {
  const player = await getPlayer();
  if (player) return { playerId: player.id };
  const guestId = create ? await ensureGuestId() : await readGuestId();
  return guestId ? { guestId } : null;
}

function ownerWhere(owner: Owner, dateKey: string): SQL {
  return and(
    eq(attempts.mode, getMode()),
    eq(attempts.dateKey, dateKey),
    "playerId" in owner ? eq(attempts.playerId, owner.playerId) : eq(attempts.guestId, owner.guestId),
  )!;
}

function ownerValues(owner: Owner) {
  return "playerId" in owner ? { playerId: owner.playerId } : { guestId: owner.guestId };
}

function deriveStatus(results: StepResult[]): AttemptStatus {
  if (results.at(-1) === "correct") return "won";
  return results.length >= HINT_COUNT ? "lost" : "playing";
}

function finishFields(results: StepResult[], now: Date) {
  const status = deriveStatus(results);
  return {
    results,
    status,
    hintsUsed: status === "won" ? results.length : null,
    finishedAt: status === "playing" ? null : now,
  };
}

export function toState(row: Pick<AttemptRow, "results" | "status">): AttemptState {
  return { results: row.results, status: row.status };
}

/** Accepts a client-reported result list only if it is a well-formed game. */
export function parseResults(raw: unknown): StepResult[] | null {
  if (!Array.isArray(raw) || raw.length > HINT_COUNT) return null;
  if (!raw.every((r): r is StepResult => STEP_RESULTS.has(r as StepResult))) return null;
  const correctAt = raw.indexOf("correct");
  if (correctAt !== -1 && correctAt !== raw.length - 1) return null;
  return raw;
}

export async function getAttempt(owner: Owner, dateKey: string): Promise<AttemptRow | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db.select().from(attempts).where(ownerWhere(owner, dateKey)).limit(1);
  return row ?? null;
}

/**
 * Returns the owner's attempt, creating it on first contact. `seed` carries
 * local progress made before the server knew about this browser (an older
 * client, or a guest session predating sign-in tracking); it only applies to
 * a brand-new row, so the server's record always wins once it exists.
 */
export async function openAttempt(
  owner: Owner,
  dateKey: string,
  seed: StepResult[] = [],
): Promise<AttemptRow | null> {
  const db = getDb();
  if (!db) return null;
  const now = new Date();
  await db
    .insert(attempts)
    .values({ mode: getMode(), dateKey, ...ownerValues(owner), startedAt: now, ...finishFields(seed, now) })
    .onConflictDoNothing();
  return getAttempt(owner, dateKey);
}

/** Appends one action under a row lock so racing tabs can't double-count. */
export async function recordAction(
  owner: Owner,
  dateKey: string,
  action: StepResult,
): Promise<AttemptRow | null> {
  const db = getDb();
  if (!db) return null;
  await db
    .insert(attempts)
    .values({ mode: getMode(), dateKey, ...ownerValues(owner) })
    .onConflictDoNothing();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(attempts).where(ownerWhere(owner, dateKey)).for("update");
    if (!row || row.status !== "playing") return row ?? null;
    const [updated] = await tx
      .update(attempts)
      .set(finishFields([...row.results, action], new Date()))
      .where(eq(attempts.id, row.id))
      .returning();
    return updated ?? null;
  });
}

/**
 * Moves the browser's guest attempts onto the player who just signed in.
 * Days the player already has on record keep the player's attempt.
 */
export async function adoptGuestAttempts(playerId: string): Promise<number> {
  const db = getDb();
  const guestId = await readGuestId();
  if (!db || !guestId) return 0;
  const moved = await db
    .update(attempts)
    .set({ playerId, guestId: null })
    .where(
      and(
        eq(attempts.guestId, guestId),
        isNull(attempts.playerId),
        sql`not exists (
          select 1 from ${attempts} as mine
          where mine.player_id = ${playerId}
            and mine.mode = ${attempts.mode}
            and mine.date_key = ${attempts.dateKey}
        )`,
      ),
    )
    .returning({ id: attempts.id });
  await db.delete(attempts).where(eq(attempts.guestId, guestId));
  (await cookies()).delete(GUEST_COOKIE);
  return moved.length;
}
