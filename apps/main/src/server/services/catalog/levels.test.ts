import { expect, it, vi } from "vitest";
import { parseDisplayLevel } from "./levels";

vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ warn: vi.fn() }) }));
it("preserves whitespace, parseInt and invalid-level fallback behavior", () => {
  expect(parseDisplayLevel(" 14+ ", 5)).toBe(145);
  expect(parseDisplayLevel("14.5", 6)).toBe(140);
  expect(parseDisplayLevel("?", 6)).toBe(10);
  expect(parseDisplayLevel("?+", 6)).toBe(10);
});
