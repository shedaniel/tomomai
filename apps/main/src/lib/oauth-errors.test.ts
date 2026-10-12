import { describe, expect, it } from "vitest";
import { readOAuthAuthorizeError } from "./oauth-errors";

const read = (query: string) => readOAuthAuthorizeError(new URLSearchParams(query));

describe("readOAuthAuthorizeError", () => {
  it("recognises the errors Better Auth's authorize endpoint sends to the error URL", () => {
    expect(read("error=invalid_redirect&error_description=invalid+redirect+uri")).toBe("invalid_redirect");
    expect(read("error=client_disabled&error_description=client+is+disabled")).toBe("client_disabled");
  });

  it("leaves a social sign-in error with the same code to the sign-in dialog", () => {
    expect(read("error=invalid_request&error_description=Missing+required+parameter")).toBeNull();
    expect(read("error=invalid_request")).toBeNull();
  });
});
