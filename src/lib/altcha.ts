import { createChallenge, verifySolution, randomInt, HmacAlgorithm, type Challenge, type Payload } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/argon2id";
import { redis } from "@/lib/redis";

function getHmacKey(): string {
  const key = process.env.ALTCHA_HMAC_KEY;
  if (!key && process.env.NODE_ENV !== "development") {
    throw new Error("ALTCHA_HMAC_KEY must be set in non-development environments");
  }
  return key ?? "development-altcha-key-change-in-production";
}

// Challenges expire 5 min after creation. Redis dedup TTL is slightly longer
// so a replay can't outlive the signed expiry window.
export const ALTCHA_CHALLENGE_TTL_SECONDS = 5 * 60;
const REDIS_TTL_SECONDS = ALTCHA_CHALLENGE_TTL_SECONDS + 60;
const REDIS_KEY_PREFIX = "altcha:used:";

// Argon2id memory-hard PoW. Per-iteration cost (OWASP minimum) makes
// GPU/ASIC parallelism uneconomical. The counter range controls how many
// iterations the client must run on average to find the prefix.
//
// Avg iterations = MAX_COUNTER / 2. With ~150ms/iter on modern hardware,
// MAX_COUNTER=20 → ~1.5s on desktop, ~3-5s on phones.
const MAX_COUNTER = 20;
const CHALLENGE_PARAMS = {
  algorithm: "ARGON2ID" as const,
  cost: 2,           // time cost (iterations)
  memoryCost: 19456, // KiB = ~19 MB (OWASP minimum)
  parallelism: 1,
  keyLength: 32,
  hmacAlgorithm: HmacAlgorithm.SHA_256,
  deriveKey,
};

export async function createAltchaChallenge(): Promise<Challenge> {
  return createChallenge({
    ...CHALLENGE_PARAMS,
    counter: randomInt(1, MAX_COUNTER),
    hmacSignatureSecret: getHmacKey(),
    expiresAt: new Date(Date.now() + ALTCHA_CHALLENGE_TTL_SECONDS * 1000),
  });
}

function decodePayload(payload: unknown): Payload | null {
  if (!payload || typeof payload !== "string") return null;
  try {
    const json = Buffer.from(payload, "base64").toString("utf-8");
    return JSON.parse(json) as Payload;
  } catch {
    return null;
  }
}

/** Stateless check: HMAC + Argon2id PoW + expiry. Safe for UX pre-verify — does not consume. */
export async function verifyAltchaPayload(payload: unknown): Promise<boolean> {
  const decoded = decodePayload(payload);
  if (!decoded?.challenge || !decoded?.solution) return false;
  try {
    const result = await verifySolution({
      challenge: decoded.challenge,
      solution: decoded.solution,
      deriveKey,
      hmacSignatureSecret: getHmacKey(),
    });
    return result.verified;
  } catch {
    return false;
  }
}

/**
 * Verifies the solution AND atomically claims it as consumed in Redis.
 * Returns true only on first redemption — replays return false.
 */
export async function consumeAltchaPayload(payload: unknown): Promise<boolean> {
  const decoded = decodePayload(payload);
  if (!decoded?.challenge || !decoded?.solution) return false;

  const signature = decoded.challenge.signature;
  if (typeof signature !== "string" || signature.length === 0) return false;

  try {
    const result = await verifySolution({
      challenge: decoded.challenge,
      solution: decoded.solution,
      deriveKey,
      hmacSignatureSecret: getHmacKey(),
    });
    if (!result.verified) return false;
  } catch {
    return false;
  }

  const key = `${REDIS_KEY_PREFIX}${signature}`;
  const claimed = await redis.set(key, "1", "EX", REDIS_TTL_SECONDS, "NX");
  return claimed === "OK";
}
