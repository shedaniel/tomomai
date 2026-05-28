import { isAlbumSettingsError, isTokenError } from "@/lib/token-errors";

/**
 * Map errors thrown by `startFetchServer` to a JSON 4xx/5xx Response for
 * REST callers. Mirrors the TRPCError-code mapping used by the tRPC
 * `startFetch` procedure so the two protocols stay in sync on which
 * upstream conditions return which class of error.
 *
 * - Missing/invalid token  → 412 Precondition Failed
 * - Album-settings problem → 412 Precondition Failed
 * - Fetch already running  → 409 Conflict
 * - Upstream rate-limited  → 429 Too Many Requests
 * - Anything else          → 500 Internal Server Error
 */
export function mapFetchStartError(error: unknown): Response {
  if (error instanceof Error) {
    if (isAlbumSettingsError(error.message)) {
      return Response.json({ error: error.message }, { status: 412 });
    }
    if (isTokenError(error.message)) {
      return Response.json({ error: error.message }, { status: 412 });
    }
    if (error.message.includes("already in progress")) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error.message.includes("Rate limited")) {
      return Response.json({ error: error.message }, { status: 429 });
    }
  }
  console.error("startFetch error:", error);
  return Response.json({ error: "Failed to start fetch" }, { status: 500 });
}
