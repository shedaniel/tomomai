import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { z } from "zod";

// Half of an HMAC-SHA256 keeps tokens short enough for links users copy by hand.
const MAC_BYTES = 16;

type SignOptions = { secret: string; ttlSeconds?: number };

function mac(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest().subarray(0, MAC_BYTES);
}

/** A URL-safe token carrying the payload, with an `exp` claim when a lifetime is given. */
export function sign(payload: Record<string, unknown>, { secret, ttlSeconds }: SignOptions): string {
  const claims = ttlSeconds === undefined ? payload : { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${body}.${mac(body, secret).toString("base64url")}`;
}

/** The payload of a token this secret signed, or null when it is forged, malformed, expired or not what the schema describes. */
export function verify<T>(token: string, schema: z.ZodType<T>, { secret }: { secret: string }): T | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const provided = Buffer.from(signature, "base64url");
  const expected = mac(body, secret);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (claims && typeof claims === "object" && "exp" in claims) {
    if (typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000) return null;
  }
  const parsed = schema.safeParse(claims);
  return parsed.success ? parsed.data : null;
}
