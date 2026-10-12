import { readOAuthAuthorizeError } from "@/lib/oauth-errors";

export type AuthErrorMessageKey =
  | "noAccount"
  | "signupUnavailable"
  | "inviteRequired"
  | "inviteInvalid"
  | "inviteRevoked"
  | "inviteUsed"
  | "inviteExpired"
  | "accountNotLinked"
  | "emailMismatch"
  | "alreadyLinked"
  | "emailMissing"
  | "restart"
  | "provider"
  | "banned"
  | "generic";

export interface ResolvedAuthError {
  code: string;
  messageKey: AuthErrorMessageKey;
  /** Which auth dialog panel can resolve the error when the visitor is signed out. */
  panel: "signin" | "signup";
}

// Codes come from Better Auth's OAuth callback (`?error=`), the default error
// route, and the APIError messages thrown by our user.create hook (lib/auth.ts).
const AUTH_ERRORS: Record<string, Omit<ResolvedAuthError, "code">> = {
  signup_disabled: { messageKey: "noAccount", panel: "signup" },
  unable_to_create_user: { messageKey: "signupUnavailable", panel: "signup" },
  invite_required: { messageKey: "inviteRequired", panel: "signup" },
  invite_invalid: { messageKey: "inviteInvalid", panel: "signup" },
  invite_revoked: { messageKey: "inviteRevoked", panel: "signup" },
  invite_used: { messageKey: "inviteUsed", panel: "signup" },
  invite_expired: { messageKey: "inviteExpired", panel: "signup" },
  account_not_linked: { messageKey: "accountNotLinked", panel: "signin" },
  "email_doesn't_match": { messageKey: "emailMismatch", panel: "signin" },
  account_already_linked_to_different_user: { messageKey: "alreadyLinked", panel: "signin" },
  email_not_found: { messageKey: "emailMissing", panel: "signin" },
  state_mismatch: { messageKey: "restart", panel: "signin" },
  state_not_found: { messageKey: "restart", panel: "signin" },
  please_restart_the_process: { messageKey: "restart", panel: "signin" },
  invalid_callback_request: { messageKey: "restart", panel: "signin" },
  no_code: { messageKey: "restart", panel: "signin" },
  invalid_code: { messageKey: "restart", panel: "signin" },
  no_callback_url: { messageKey: "restart", panel: "signin" },
  unable_to_get_user_info: { messageKey: "provider", panel: "signin" },
  oauth_provider_not_found: { messageKey: "provider", panel: "signin" },
  banned: { messageKey: "banned", panel: "signin" },
};

// The visitor backed out at the provider's consent screen; nothing to report.
const SILENT_CODES = new Set(["access_denied"]);

/** Returns null for codes that should not surface any UI. */
export function resolveAuthError(code: string): ResolvedAuthError | null {
  if (SILENT_CODES.has(code)) return null;
  const known = AUTH_ERRORS[code];
  return { code, ...(known ?? { messageKey: "generic", panel: "signin" }) };
}

/**
 * Reads the auth error from a page's query. Better Auth reports a missing
 * OAuth state as `?state=state_not_found` rather than `?error=`.
 */
export function readAuthErrorCode(params: URLSearchParams): string | null {
  // OAuth provider authorize errors belong to the consent page, which shows them itself.
  if (readOAuthAuthorizeError(params)) return null;
  const error = params.get("error");
  if (error) return error;
  return params.get("state") === "state_not_found" ? "state_not_found" : null;
}

export function stripAuthErrorParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("error");
  next.delete("error_description");
  if (next.get("state") === "state_not_found") next.delete("state");
  return next;
}
