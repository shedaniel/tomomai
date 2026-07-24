import { describe, expect, it } from "vitest";

import {
  PROFILE_DESCRIPTION_BYTE_LIMIT_MESSAGE,
  PROFILE_DESCRIPTION_CHARACTER_LIMIT_MESSAGE,
  createProfileDescriptionInputSchema,
  profileDescriptionInputSchema,
} from "./profile-description";

describe("profile description input", () => {
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

  it("accepts exactly 2,000 characters and rejects 2,001 without truncating", () => {
    const boundary = "x".repeat(2000);
    expect(profileDescriptionInputSchema.parse({ profileDescription: boundary })).toEqual({
      profileDescription: boundary,
    });

    const oversized = "x".repeat(2001);
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
