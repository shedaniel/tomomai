import { describe, expect, it } from "vitest";
import { CATALOG_IDENTITY_FIELDS, CATALOG_INSTANCE_FIELDS, CATALOG_PARENT_FIELDS, catalogChartSchema } from "./schema";

describe("catalog chart fields", () => {
  it("assign every chart field to exactly one of identity, parent and instance", () => {
    const assigned = [...CATALOG_IDENTITY_FIELDS, ...CATALOG_PARENT_FIELDS, ...CATALOG_INSTANCE_FIELDS];
    expect(new Set(assigned).size).toBe(assigned.length);
    expect(assigned.toSorted()).toEqual(Object.keys(catalogChartSchema.shape).toSorted());
  });
});
