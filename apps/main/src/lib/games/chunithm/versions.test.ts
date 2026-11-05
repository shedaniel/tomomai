import { describe, expect, it } from "vitest";
import { chunithmVersionTable } from "./versions";

const jst = (instant: string) => new Date(`${instant}+09:00`);

describe("chunithmVersionTable", () => {
  it("moves International to Mate on its own release day", () => {
    expect(chunithmVersionTable.current("intl", jst("2026-10-22T06:59:59"))).toBe(8);
    expect(chunithmVersionTable.current("intl", jst("2026-10-22T07:00:00"))).toBe(9);
    expect(chunithmVersionTable.current("jp", jst("2026-10-22T06:59:59"))).toBe(9);
  });
});
