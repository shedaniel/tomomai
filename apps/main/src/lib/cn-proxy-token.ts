import crypto from "node:crypto";

const TTL_SECONDS = 15 * 60;
const MAC_BYTES = 16; // 128-bit truncated HMAC-SHA256

function getSecret(): string {
  const secret = process.env.CN_PROXY_TOKEN_SECRET;
  if (!secret) throw new Error("CN_PROXY_TOKEN_SECRET must be set to sign cn-proxy tokens.");
  return secret;
}

function mac(payload: string): Buffer {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest().subarray(0, MAC_BYTES);
}

/**
 * Sign a compact authenticator binding a user to a single OAuth handoff,
 * embedded inside the redirect_uri of the WeChat OAuth URL. Format:
 *   {userId}.{exp_b36}.{hmac128_b64url}
 * Same security properties as the prior JWT (HMAC-SHA256, exp), ~4× shorter
 * because we skip the JSON envelope + double base64.
 */
export function signCnProxyToken(userId: string): string {
  if (userId.includes(".")) throw new Error("userId must not contain '.'");
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${userId}.${exp.toString(36)}`;
  return `${payload}.${mac(payload).toString("base64url")}`;
}

export function verifyCnProxyToken(encoded: string): { userId: string } {
  const parts = encoded.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [userId, expB36, sigB64] = parts;
  if (!userId) throw new Error("missing userId");

  const expected = mac(`${userId}.${expB36}`);
  const got = Buffer.from(sigB64, "base64url");
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) {
    throw new Error("bad signature");
  }

  const exp = parseInt(expB36, 36);
  if (!Number.isFinite(exp)) throw new Error("malformed exp");
  if (exp < Math.floor(Date.now() / 1000)) throw new Error("token expired");
  return { userId };
}
