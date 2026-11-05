import { parseFetchErrorCode, type FetchErrorCode } from "@/lib/games/fetch-error-codes";

const TOKEN_ERROR_CODES: ReadonlySet<FetchErrorCode> = new Set(["NO_TOKEN_FOUND", "TOKEN_UNREADABLE", "CN_COOKIES_SINGLE_USE"]);

// Login failures inside a running fetch are stored on the session without a code.
const UNCODED_TOKEN_FAILURES = [
  "Token has expired",
  "Please provide a new token",
  "Login failed",
  "Invalid token",
  "Session expired",
  "authentication token",
  "check your username and password",
].map(pattern => pattern.toLowerCase());

/** Whether a fetch failure means the user has to provide a new token. */
export function isTokenError(message: string): boolean {
  const code = parseFetchErrorCode(message);
  if (code) return TOKEN_ERROR_CODES.has(code);
  const lower = message.toLowerCase();
  return UNCODED_TOKEN_FAILURES.some(pattern => lower.includes(pattern));
}
