import { describe, expect, it } from "vitest";
import { getAvailableVersions } from "@/lib/metadata";
import { parseCatalogVersion } from "./parse-version";

describe("parseCatalogVersion", () => {
  it("accepts every supported catalog slice", () => {
    for (const region of ["jp", "intl", "cn"] as const) {
      for (const version of getAvailableVersions(region)) {
        expect(parseCatalogVersion(region, String(version.id))).toBe(version.id);
      }
    }
  });

  it("rejects unsupported versions before they can be persisted", () => {
    expect(() => parseCatalogVersion("jp", "999")).toThrow();
    expect(() => parseCatalogVersion("intl", "-32768")).toThrow();
  });

  it("requires a complete canonical integer", () => {
    const version = String(getAvailableVersions("jp")[0].id);
    for (const input of ["", " ", `${version}garbage`, `${version}.0`, ` ${version}`, `${version} `, `+${version}`, `0${version}`, "-0", "Infinity", "NaN"]) {
      expect(() => parseCatalogVersion("jp", input), input).toThrow();
    }
  });
});
