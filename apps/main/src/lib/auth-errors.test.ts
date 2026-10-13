import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import { readAuthErrorCode, resolveAuthError, stripAuthErrorParams } from "./auth-errors";

describe("resolveAuthError", () => {
  it("sends account-creation failures to the sign-up panel", () => {
    expect(resolveAuthError("signup_disabled")).toEqual({ code: "signup_disabled", messageKey: "noAccount", panel: "signup" });
    expect(resolveAuthError("invite_expired")).toEqual({ code: "invite_expired", messageKey: "inviteExpired", panel: "signup" });
  });

  it("keeps sign-in failures on the sign-in panel", () => {
    expect(resolveAuthError("state_mismatch")).toEqual({ code: "state_mismatch", messageKey: "restart", panel: "signin" });
    expect(resolveAuthError("banned")?.messageKey).toBe("banned");
  });

  it("falls back to a generic message for unknown codes", () => {
    expect(resolveAuthError("something_new")).toEqual({ code: "something_new", messageKey: "generic", panel: "signin" });
  });

  it("stays silent when the visitor cancelled at the provider", () => {
    expect(resolveAuthError("access_denied")).toBeNull();
  });

  it("has an English message for every key it can return", () => {
    const codes = [
      "signup_disabled", "unable_to_create_user", "invite_required", "invite_invalid", "invite_revoked",
      "invite_used", "invite_expired", "account_not_linked", "email_doesn't_match",
      "account_already_linked_to_different_user", "email_not_found", "state_not_found",
      "unable_to_get_user_info", "banned", "unknown",
    ];
    for (const code of codes) {
      const key = resolveAuthError(code)!.messageKey;
      expect(en.auth.errors[key], key).toBeTypeOf("string");
    }
  });
});

describe("auth error query params", () => {
  it("reads ?error= and Better Auth's ?state=state_not_found", () => {
    expect(readAuthErrorCode(new URLSearchParams("error=invalid_code"))).toBe("invalid_code");
    expect(readAuthErrorCode(new URLSearchParams("state=state_not_found"))).toBe("state_not_found");
    expect(readAuthErrorCode(new URLSearchParams("state=abc"))).toBeNull();
  });

  it("strips only auth error params", () => {
    const stripped = stripAuthErrorParams(new URLSearchParams("tab=songs&error=banned&error_description=x&state=state_not_found"));
    expect(stripped.toString()).toBe("tab=songs");
    expect(stripAuthErrorParams(new URLSearchParams("state=keep")).toString()).toBe("state=keep");
  });
});
