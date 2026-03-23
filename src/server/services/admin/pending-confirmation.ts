import { redis } from "@/lib/redis";
import { nanoid } from "nanoid";

const PENDING_PREFIX = "pending:";
const DEFAULT_TTL_SECONDS = 30 * 60 * 60; // 30 hours

export type PendingPayload<T> = {
  type: string;
  data: T;
  createdAt: string;
};

/** Store a payload in Redis, returning the nanoid key. */
export async function storePending<T>(
  type: string,
  data: T,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const id = nanoid();
  const payload: PendingPayload<T> = {
    type,
    data,
    createdAt: new Date().toISOString(),
  };
  await redis.set(
    `${PENDING_PREFIX}${id}`,
    JSON.stringify(payload),
    "EX",
    ttlSeconds,
  );
  return id;
}

/** Retrieve a pending payload by nanoid. Returns null if expired/missing. */
export async function getPending<T>(id: string): Promise<PendingPayload<T> | null> {
  const raw = await redis.get(`${PENDING_PREFIX}${id}`);
  if (!raw) return null;
  return JSON.parse(raw) as PendingPayload<T>;
}

/** Retrieve and delete (consume) a pending payload atomically. */
export async function consumePending<T>(id: string): Promise<PendingPayload<T> | null> {
  const raw = await redis.getdel(`${PENDING_PREFIX}${id}`);
  if (!raw) return null;
  return JSON.parse(raw) as PendingPayload<T>;
}
