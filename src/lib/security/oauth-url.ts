import { z } from "zod";

// OAuth redirect URIs must be https://, with http://localhost permitted for local dev.
// Other schemes (javascript:, data:, custom mobile schemes, plain http) are rejected
// to prevent token exfiltration via malicious clients. Better Auth's built-in
// SafeUrlSchema (used on `redirect_uris`) is laxer: it permits arbitrary custom
// schemes for mobile apps, so we enforce this stricter rule both in our tRPC
// router AND in a hooks.before guard on /oauth2/{create,update}-client so direct
// HTTP callers cannot bypass it.
// RFC 6761 reserves `*.localhost`; `[::1]` is the WHATWG `hostname` form of IPv6 loopback.
function isLoopbackHostname(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "[::1]"
  );
}

export function isSafeRedirectUrl(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    // BCP 212 §3.1: reject userinfo (`https://attacker:x@trusted/cb`).
    if (u.username !== "" || u.password !== "") return false;
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && isLoopbackHostname(u.hostname)) return true;
    return false;
  } catch { return false; }
}

// Metadata URLs (homepage, policy, tos) are shown to end users on the
// consent screen; restrict to http(s) so we can never render javascript:/data: links.
// BA accepts these as plain strings with no scheme check.
export function isSafeWebUrl(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try {
    return ["http:", "https:"].includes(new URL(v).protocol);
  } catch { return false; }
}

// `logo_uri` (icon) is rendered as an <img> on the https consent page; plain
// http would trip mixed-content warnings and lets an attacker host a phishing
// pixel. Tightened to https-only while homepage/tos/policy stay http(s).
export function isHttpsUrl(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try {
    return new URL(v).protocol === "https:";
  } catch { return false; }
}

export const httpsRedirectUrl = z.string().url().refine(isSafeRedirectUrl, {
  message: "Must be an https:// URL (http://localhost permitted for development)",
});

export const safeWebUrl = z.string().url().refine(isSafeWebUrl, {
  message: "Must be an http(s):// URL",
});

export const httpsWebUrl = z.string().url().refine(isHttpsUrl, {
  message: "Must be an https:// URL",
});

// Render-time guards for the consent page: defence-in-depth in case a write
// path ever skips the hooks.before validators (DB seed, admin tool, future
// endpoint that forgets to register).
export function safeHref(v: unknown): string | undefined {
  return isSafeWebUrl(v) ? v : undefined;
}

export function safeImg(v: unknown): string | undefined {
  return isHttpsUrl(v) ? v : undefined;
}
