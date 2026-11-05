import { describe, expect, it } from "vitest";
import { isFriendMatch } from "./matching";

const older = new Date("2026-10-01T00:00:00Z");
const newer = new Date("2026-10-02T00:00:00Z");

describe("isFriendMatch", () => {
  it("trusts the only list there is", () => {
    expect(isFriendMatch({ syncedAt: newer, names: true }, { syncedAt: null, names: false })).toBe(true);
    expect(isFriendMatch({ syncedAt: null, names: false }, { syncedAt: newer, names: true })).toBe(true);
    expect(isFriendMatch({ syncedAt: newer, names: false }, { syncedAt: null, names: false })).toBe(false);
  });

  it("lets the newer list decide when both players have one", () => {
    expect(isFriendMatch({ syncedAt: newer, names: false }, { syncedAt: older, names: true })).toBe(false);
    expect(isFriendMatch({ syncedAt: older, names: false }, { syncedAt: newer, names: true })).toBe(true);
    expect(isFriendMatch({ syncedAt: newer, names: true }, { syncedAt: newer, names: false })).toBe(true);
  });

  it("never matches players without a list", () => {
    expect(isFriendMatch({ syncedAt: null, names: false }, { syncedAt: null, names: false })).toBe(false);
  });
});
