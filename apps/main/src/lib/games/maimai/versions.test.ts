import { describe, expect, it } from "vitest";
import { getVersionByShortCode } from "./versions";

describe("maimai version lookups", () => {
  it("resolves a five-digit short code to the latest version at or below its prefix", () => {
    expect(getVersionByShortCode("19995")?.name).toBe("maimai FiNALE");
    expect(getVersionByShortCode("20000")?.name).toBe("maimai DX");
    expect(getVersionByShortCode("27012")?.name).toBe("maimai DX MAGiCAL");
    expect(getVersionByShortCode("09999")).toBeUndefined();
    expect(getVersionByShortCode("2000")).toBeUndefined();
  });
});
