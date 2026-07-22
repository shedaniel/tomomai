const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;

export type TurnstileVerificationResult =
  | { success: true }
  | { success: false; reason: "invalid" | "misconfigured" | "unavailable" };

export interface VerifyTurnstileTokenOptions {
  token: unknown;
  secretKey: string | undefined;
  remoteIp?: string;
  expectedAction?: string;
  expectedHostname?: string;
}

interface SiteverifyResponse {
  success?: unknown;
  action?: unknown;
  hostname?: unknown;
}

export async function verifyTurnstileToken({
  token,
  secretKey,
  remoteIp,
  expectedAction,
  expectedHostname,
}: VerifyTurnstileTokenOptions): Promise<TurnstileVerificationResult> {
  if (!secretKey) return { success: false, reason: "misconfigured" };
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { success: false, reason: "invalid" };
  }

  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
  });
  if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { success: false, reason: "unavailable" };

    const result = (await response.json()) as SiteverifyResponse;
    if (result.success !== true) return { success: false, reason: "invalid" };
    if (expectedAction && result.action !== expectedAction) {
      return { success: false, reason: "invalid" };
    }
    if (expectedHostname && result.hostname !== expectedHostname) {
      return { success: false, reason: "invalid" };
    }

    return { success: true };
  } catch {
    return { success: false, reason: "unavailable" };
  }
}
