/** FNV-1a, so a username always lands on the same fake code. */
function hash(text: string, seed = 0x811c9dc5): number {
  let value = seed;
  for (const char of text) {
    value ^= char.codePointAt(0)!;
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/** A 13-digit friend code, the length DX NET uses. Fake, but stable per username. */
export function netFriendCode(username: string): string {
  const key = username.toLowerCase();
  const high = String(hash(key) % 10_000_000).padStart(7, "0");
  const low = String(hash(key, 0x9747b28c) % 1_000_000).padStart(6, "0");
  return `${(Number(high[0]) % 9) + 1}${high.slice(1)}${low}`;
}

const CIRCLE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** An 8-character circle code, stable per username. */
export function netCircleCode(username: string): string {
  let value = hash(`circle:${username.toLowerCase()}`);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CIRCLE_ALPHABET[value % CIRCLE_ALPHABET.length];
    value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d) >>> 0;
  }
  return code;
}

/** Picks one of `count` lines for a username, so the roast does not change on every reload. */
export function netPick(seed: string, count: number): number {
  return hash(seed) % count;
}
