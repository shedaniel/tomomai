import { describe, expect, it } from "vitest";
import { createVersionTable, versionReleaseInstant } from "./version-table";

const table = createVersionTable([
  { id: 1, name: "Game One", shortName: "One", releaseDates: { jp: "2020/01/10", intl: "2020/06/10" } },
  { id: 2, name: "Game One PLUS", shortName: "One+", aliases: ["One PLUS"], releaseDates: { jp: "2020/07/10" } },
  { id: 3, name: "Game Two", shortName: "Two", releaseDates: { jp: "2021/01/10", intl: "2021/01/10" } },
  { id: 4, name: "Game Two PLUS", shortName: "Two+", releaseDates: { jp: "2021/06/10", intl: "2021/01/10" } },
  { id: 5, name: "Game Three", shortName: "Three", releaseDates: { jp: "2022/01/10", intl: "2022/06/10" } },
]);
const jst = (instant: string) => new Date(`${instant}+09:00`);

describe("createVersionTable", () => {
  it("rolls every region over at 07:00 JST on the release day", () => {
    expect(versionReleaseInstant("2022/06/10").toISOString()).toBe("2022-06-09T22:00:00.000Z");
    for (const [region, day, previous, next] of [["jp", "2022-01-10", 4, 5], ["intl", "2022-06-10", 4, 5]] as const) {
      for (const time of ["00:00:00", "06:59:59.999"]) {
        expect(table.atDate(region, jst(`${day}T${time}`))).toBe(previous);
        expect(table.current(region, jst(`${day}T${time}`))).toBe(previous);
      }
      expect(table.atDate(region, jst(`${day}T07:00:00`))).toBe(next);
      expect(table.current(region, jst(`${day}T07:00:00`))).toBe(next);
    }
  });

  it("uses a preferred version only within the latest regional release-date tie", () => {
    const tie = jst("2021-01-10T07:00:00");
    expect(table.atDate("intl", tie)).toBe(4);
    expect(table.atDate("intl", tie, 3)).toBe(3);
    for (const outsideTie of [1, 2, 5, 999]) expect(table.atDate("intl", tie, outsideTie)).toBe(4);
    expect(table.atDate("intl", jst("2021-01-10T06:59:59"), 3)).toBe(1);
    expect(table.atDate("intl", jst("2022-06-10T07:00:00"), 3)).toBe(5);
  });

  it("finds a row by one unambiguous name, short name or alias", () => {
    expect(table.byName(" game one plus ")?.id).toBe(2);
    expect(table.byName("one+")?.id).toBe(2);
    expect(table.byName("TWO")?.id).toBe(3);
    expect(table.byName("missing")).toBeNull();
    const ambiguous = createVersionTable([
      { id: 1, name: "First", shortName: "Shared", releaseDates: {} },
      { id: 2, name: "Second", shortName: "Other", aliases: ["shared"], releaseDates: {} },
    ]);
    expect(ambiguous.byName("Shared")).toBeNull();
    expect(ambiguous.byName("Second")?.id).toBe(2);
  });
});
