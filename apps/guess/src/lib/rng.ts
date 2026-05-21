import crypto from "node:crypto";

function getSecret(): string {
  const secret = process.env.GUESS_DAILY_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "GUESS_DAILY_SECRET is missing or too short. Set it in apps/guess/.env.local — see .env.example.",
    );
  }
  return secret;
}

/**
 * Deterministic PRNG seeded from an HMAC stream keyed on GUESS_DAILY_SECRET.
 * The 32-byte buffer is refilled by HMAC'ing `${label}:N` when exhausted, so
 * the stream is effectively unbounded but still pure in (secret, label).
 *
 * Used everywhere we need stable randomness pinned to a date + topic — chart
 * pick, step plan, image transform seeds. Previously this was duplicated as
 * `Rng` in daily.ts and `ImgRng` in image.ts.
 */
export class Rng {
  private label: string;
  private chunk = 0;
  private buf: Buffer;
  private offset = 0;

  constructor(label: string) {
    this.label = label;
    this.buf = this.refill(0);
  }

  private refill(n: number): Buffer {
    return crypto.createHmac("sha256", getSecret()).update(`${this.label}:${n}`).digest();
  }

  private nextBytes(n: number): Buffer {
    if (this.offset + n > this.buf.length) {
      this.chunk += 1;
      this.buf = this.refill(this.chunk);
      this.offset = 0;
    }
    const out = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }

  intBelow(max: number): number {
    if (max <= 0) return 0;
    const b = this.nextBytes(4);
    // readUInt32BE — bit-shifting in JS produces a *signed* Int32, and
    // `Math.abs(INT32_MIN)` is still INT32_MIN, which would yield negative
    // modulo results and bias the distribution.
    const u = b.readUInt32BE(0);
    return u % max;
  }

  float(): number {
    const b = this.nextBytes(4);
    return b.readUInt32BE(0) / 0x1_0000_0000;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.intBelow(arr.length)]!;
  }

  pickWeighted<T>(arr: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (let i = 0; i < arr.length; i++) total += weights[i] ?? 0;
    if (total <= 0) return arr[this.intBelow(arr.length)]!;
    let r = this.float() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i] ?? 0;
      if (r <= 0) return arr[i]!;
    }
    return arr[arr.length - 1]!;
  }
}
