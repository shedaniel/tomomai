import { describe, expect, it } from "vitest";
import { getGameMaintenance } from "./maintenance";

describe("international maintenance in JST", () => {
  it.each([
    ["2026-09-08", 2],
    ["2026-09-09", 4],
    ["2026-09-10", 2],
    ["2026-09-11", 2],
    ["2026-09-12", 2],
    ["2026-09-13", 2],
    ["2026-09-14", 2],
  ])("uses the correct boundaries on %s", (day, endHour) => {
    const start = new Date(`${day}T01:00:00+09:00`).getTime();
    const end = new Date(`${day}T0${endHour}:00:00+09:00`).getTime();
    expect(getGameMaintenance("maimai", "intl", new Date(start - 1))?.active).toBe(false);
    expect(getGameMaintenance("maimai", "intl", new Date(start))?.active).toBe(true);
    expect(getGameMaintenance("maimai", "intl", new Date(end - 1))?.active).toBe(true);
    expect(getGameMaintenance("maimai", "intl", new Date(end))?.active).toBe(false);
    expect(getGameMaintenance("maimai", "intl", new Date(`${day}T06:00:00+09:00`))?.active).toBe(false);
  });
});

it("uses the next JST day's Wednesday exception after Tuesday maintenance ends", () => {
  expect(getGameMaintenance("maimai", "intl", new Date("2026-09-07T17:00:00Z"))).toEqual({
    active: false,
    startsAt: new Date("2026-09-08T16:00:00Z"),
    endsAt: new Date("2026-09-08T19:00:00Z"),
  });
});

describe("other regions retain their existing maintenance", () => {
  it.each(["jp", "cn"] as const)("keeps 4–7 AM JST for %s", (region) => {
    for (const day of ["2026-09-09", "2026-09-10"]) {
      expect(getGameMaintenance("maimai", region, new Date(`${day}T01:00:00+09:00`))?.active).toBe(false);
      expect(getGameMaintenance("maimai", region, new Date(`${day}T03:59:59.999+09:00`))?.active).toBe(false);
      expect(getGameMaintenance("maimai", region, new Date(`${day}T04:00:00+09:00`))?.active).toBe(true);
      expect(getGameMaintenance("maimai", region, new Date(`${day}T06:59:59.999+09:00`))?.active).toBe(true);
      expect(getGameMaintenance("maimai", region, new Date(`${day}T07:00:00+09:00`))?.active).toBe(false);
    }
  });
});
