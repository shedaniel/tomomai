import { describe, expect, it } from "vitest";
import { isReservedAppName } from "./developer-limits";

describe("isReservedAppName", () => {
  it.each(["tomomai", "Tomomai Official", "TOMO-MAI helper", "ｔｏｍｏｍａｉ", "ともマイ bot", "トモマイ"])(
    "rejects %s, which could pass for tomomai",
    (name) => expect(isReservedAppName(name)).toBe(true),
  );

  it.each(["maimai stats", "Tomo's tracker", "DX rating helper"])("allows %s", (name) =>
    expect(isReservedAppName(name)).toBe(false),
  );
});
