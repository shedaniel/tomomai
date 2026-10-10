/**
 * Errors Better Auth's OAuth provider raises before it trusts the app's redirect_uri, so it sends
 * them to our error URL instead of back to the app. Codes such as `invalid_request` are also
 * standard social-login errors, so a code only counts when Better Auth's exact description matches.
 */
const AUTHORIZE_ERRORS = {
  invalid_redirect: ["invalid redirect uri"],
  invalid_client: ["client_id is required"],
  client_disabled: ["client is disabled"],
  invalid_request: ["response_type is required"],
  invalid_request_uri: ["request_uri not supported", "request_uri is invalid or expired"],
  unsupported_response_type: ["unsupported response type"],
  unsupported_prompt_select_account: ["unsupported prompt type"],
} as const;

export type OAuthAuthorizeError = keyof typeof AUTHORIZE_ERRORS;

export function readOAuthAuthorizeError(params: URLSearchParams): OAuthAuthorizeError | null {
  const code = params.get("error");
  if (!code || !(code in AUTHORIZE_ERRORS)) return null;
  const descriptions: readonly string[] = AUTHORIZE_ERRORS[code as OAuthAuthorizeError];
  return descriptions.includes(params.get("error_description") ?? "") ? (code as OAuthAuthorizeError) : null;
}

/** The consent page's message for each failure, from most to least specific. */
export type ConsentErrorKind = "redirect" | "unavailable" | "badRequest" | "tampered" | "missingClient" | "loadFailed";

export function consentErrorKind(code: OAuthAuthorizeError): ConsentErrorKind {
  if (code === "invalid_redirect") return "redirect";
  if (code === "invalid_client" || code === "client_disabled") return "unavailable";
  return "badRequest";
}
