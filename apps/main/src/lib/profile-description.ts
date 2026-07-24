import { validateMarkdownSize, type MarkdownLimits } from "@tomomai/markdown";
import { z } from "zod";

export const PROFILE_DESCRIPTION_LIMITS = {
  maxCharacters: 2000,
  maxUtf8Bytes: 8192,
} as const satisfies MarkdownLimits;

export const PROFILE_DESCRIPTION_CHARACTER_LIMIT_MESSAGE =
  "Profile description must be 2,000 characters or fewer";
export const PROFILE_DESCRIPTION_BYTE_LIMIT_MESSAGE =
  "Profile description must be 8,192 UTF-8 bytes or fewer";

export const profileDescriptionMutationInputSchema = z.object({
  profileDescription: z.string().nullable(),
});

export function createProfileDescriptionInputSchema(limits: MarkdownLimits) {
  return profileDescriptionMutationInputSchema
    .transform(({ profileDescription }) => ({
      profileDescription: profileDescription?.trim() || null,
    }))
    .superRefine(({ profileDescription }, ctx) => {
      if (profileDescription === null) return;

      const result = validateMarkdownSize(profileDescription, limits);
      if (result.ok) return;

      ctx.addIssue({
        code: "custom",
        path: ["profileDescription"],
        message:
          result.exceeded === "characters"
            ? PROFILE_DESCRIPTION_CHARACTER_LIMIT_MESSAGE
            : PROFILE_DESCRIPTION_BYTE_LIMIT_MESSAGE,
      });
    });
}

export const profileDescriptionInputSchema = createProfileDescriptionInputSchema(
  PROFILE_DESCRIPTION_LIMITS,
);

export function validateProfileDescriptionInput(
  input: z.infer<typeof profileDescriptionMutationInputSchema>,
) {
  return profileDescriptionInputSchema.safeParse(input);
}
