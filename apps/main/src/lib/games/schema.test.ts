import { describe, expect, it } from "vitest";
import { gameIdSchema } from "./schema";

describe("explicit game inputs", () => {
  it("uses canonical IDs without an implicit maimai fallback", () => {
    expect(gameIdSchema.safeParse(undefined).success).toBe(false);
    expect(gameIdSchema.safeParse("maimaidx").success).toBe(false);
    expect(gameIdSchema.safeParse("unknown").success).toBe(false);
  });
});
