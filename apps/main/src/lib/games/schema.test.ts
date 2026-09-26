import { describe, expect, it } from "vitest";
import { gameIdSchema, maimaiCompatibilityGameSchema } from "./schema";

describe("explicit game inputs", () => {
  it("uses canonical IDs without an implicit maimai fallback", () => {
    expect(gameIdSchema.safeParse(undefined).success).toBe(false);
    expect(gameIdSchema.safeParse("maimaidx").success).toBe(false);
    expect(gameIdSchema.safeParse("unknown").success).toBe(false);
  });

  it("restricts specialized maimai features without defaulting omitted inputs", () => {
    expect(maimaiCompatibilityGameSchema.parse("maimai")).toBe("maimai");
    expect(maimaiCompatibilityGameSchema.safeParse("chunithm").success).toBe(false);
    expect(maimaiCompatibilityGameSchema.safeParse(undefined).success).toBe(false);
  });
});
