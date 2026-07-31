import { describe, expect, it } from "vitest";

import {
  PROFILE_DESCRIPTION_BYTE_LIMIT_MESSAGE,
  PROFILE_DESCRIPTION_CHARACTER_LIMIT_MESSAGE,
  PROFILE_DESCRIPTION_LIMITS,
  createProfileDescriptionInputSchema,
  profileDescriptionInputSchema,
} from "./profile-description";

describe("profile description input", () => {
  it("uses the default profile allowance", () => {
    expect(PROFILE_DESCRIPTION_LIMITS).toEqual({
      maxCharacters: 500,
      maxUtf8Bytes: 2048,
    });
  });

  it("trims source and normalizes blank input to null", () => {
    expect(profileDescriptionInputSchema.parse({ profileDescription: "  **About me**  " })).toEqual({
      profileDescription: "**About me**",
    });
    expect(profileDescriptionInputSchema.parse({ profileDescription: " \n\t " })).toEqual({
      profileDescription: null,
    });
    expect(profileDescriptionInputSchema.parse({ profileDescription: null })).toEqual({
      profileDescription: null,
    });
  });

  it("accepts exactly 500 characters and rejects 501 without truncating", () => {
    const boundary = "x".repeat(PROFILE_DESCRIPTION_LIMITS.maxCharacters);
    expect(profileDescriptionInputSchema.parse({ profileDescription: boundary })).toEqual({
      profileDescription: boundary,
    });

    const oversized = `${boundary}x`;
    const result = profileDescriptionInputSchema.safeParse({ profileDescription: oversized });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(PROFILE_DESCRIPTION_CHARACTER_LIMIT_MESSAGE);
      expect(result.error.issues[0]?.path).toEqual(["profileDescription"]);
    }
  });

  it("reports the UTF-8 byte ceiling independently", () => {
    const byteBoundedSchema = createProfileDescriptionInputSchema({
      maxCharacters: 10,
      maxUtf8Bytes: 5,
    });
    const result = byteBoundedSchema.safeParse({ profileDescription: "界界" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(PROFILE_DESCRIPTION_BYTE_LIMIT_MESSAGE);
      expect(result.error.issues[0]?.path).toEqual(["profileDescription"]);
    }
  });
});
