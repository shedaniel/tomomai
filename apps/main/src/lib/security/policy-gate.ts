// Shared, client-safe constant + detector for the "requires a newer policy
// acceptance" gate. Mirrors fresh-session.ts. The server (auth.ts hooks.before,
// or a tRPC route via policy-gate-server.ts) throws this code; the client
// detects it and launches the consent dialog.
export const NEW_POLICY_REQUIRED_CODE = "NEW_POLICY_REQUIRED";

export function isNewPolicyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: unknown; cause?: unknown; data?: unknown };
  if (typeof e.message === "string" && e.message === NEW_POLICY_REQUIRED_CODE) return true;
  const cause = e.cause as { code?: unknown } | undefined;
  if (cause && cause.code === NEW_POLICY_REQUIRED_CODE) return true;
  const data = e.data as { code?: unknown } | undefined;
  if (data && data.code === NEW_POLICY_REQUIRED_CODE) return true;
  return false;
}
