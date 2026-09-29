import { expect, it } from "vitest";
import { isTokenError } from "./token-errors";

it.each([
  ["NO_TOKEN_FOUND: No authentication token found.", true],
  ["TOKEN_UNREADABLE: Failed to decrypt stored token.", true],
  ["CN_COOKIES_SINGLE_USE: This session token is single-use.", true],
  ["Session expired or invalid. Please provide a new token.", true],
  ["CHUNITHM login session expired. Please sign in again.", true],
  ["MAINTENANCE: Cannot fetch data during maintenance window (01:00 - 02:00 JST)", false],
  ["NO_USE_ALBUMS_SETTINGS: No fetch albums settings preference set.", false],
  ["SUBSCRIPTION_REQUIRED: Fetching complete CHUNITHM JP scores requires an active subscription.", false],
  ["Fetch operation timed out after 2 minutes", false],
])("treats %j as a token failure: %s", (message, expected) => {
  expect(isTokenError(message)).toBe(expected);
});
