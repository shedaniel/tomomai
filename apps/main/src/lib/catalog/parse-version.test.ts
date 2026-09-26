import { describe, expect, it } from "vitest";
import { getAvailableVersions } from "@/lib/games/versions";
import { parseCatalogVersion } from "./parse-version";

describe("parseCatalogVersion", () => {
  it("accepts every supported catalog slice", () => {
    for (const region of ["jp", "intl", "cn"] as const) {
      for (const version of getAvailableVersions("maimai", region)) {
        expect(parseCatalogVersion("maimai", region, String(version.id))).toBe(version.id);
      }
    }
  });

  it("accepts CHUNITHM regional versions", () => {
    expect(parseCatalogVersion("chunithm", "intl", "-7")).toBe(-7);
  });

  it("rejects unsupported versions before they can be persisted", () => {
    expect(() => parseCatalogVersion("maimai", "jp", "999")).toThrow();
    expect(() => parseCatalogVersion("maimai", "intl", "-32768")).toThrow();
  });

  it("requires a complete canonical integer", () => {
    const version = String(getAvailableVersions("maimai", "jp")[0].id);
    for (const input of ["", " ", `${version}garbage`, `${version}.0`, ` ${version}`, `${version} `, `+${version}`, `0${version}`, "-0", "1e3", "Infinity", "NaN"]) {
      expect(() => parseCatalogVersion("maimai", "jp", input), input).toThrow();
    }
  });
});
