function bytesToBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function base64url(bytes: Uint8Array): string {
  return bytesToBase64url(bytes);
}

function randomBase64url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64url(bytes);
}

export function randomVerifier(): string {
  return randomBase64url(32);
}

export function randomState(): string {
  return randomBase64url(16);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return bytesToBase64url(new Uint8Array(digest));
}
