import { describe, expect, it } from "vitest";
import { isOfficialClient, usageBucket } from "./oauth-official";

describe("isOfficialClient", () => {
  it("reads object and string-encoded metadata", () => {
    expect(isOfficialClient({ official: true })).toBe(true);
    expect(isOfficialClient(JSON.stringify({ official: true }))).toBe(true);
    expect(isOfficialClient({ official: "true" })).toBe(false);
    expect(isOfficialClient(null)).toBe(false);
    expect(isOfficialClient("not json")).toBe(false);
  });
});

describe("usageBucket", () => {
  it("buckets user counts at each boundary", () => {
    const cases: [number, string][] = [
      [0, "lt10"], [9, "lt10"], [10, "lt50"], [49, "lt50"], [50, "lt100"], [99, "lt100"],
      [100, "gte100"], [199, "gte100"], [200, "gte200"], [499, "gte200"], [500, "gte500"],
      [999, "gte500"], [1000, "gte1000"], [25000, "gte1000"],
    ];
    for (const [n, bucket] of cases) expect(usageBucket(n)).toBe(bucket);
  });
});
