import { describe, expect, it } from "vitest";
import { androidAssetLinks, appLinkResponse, appleAppSiteAssociation } from "./app-links";

const FINGERPRINT = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0").toUpperCase()).join(":");

describe("appleAppSiteAssociation", () => {
  it("claims only the callback path for the configured apps", () => {
    expect(appleAppSiteAssociation({ APPLE_APP_IDS: "ABCDE12345.lol.tomomai.app, ABCDE12345.lol.tomomai.app.dev" })).toEqual({
      applinks: {
        details: [
          {
            appIDs: ["ABCDE12345.lol.tomomai.app", "ABCDE12345.lol.tomomai.app.dev"],
            components: [{ "/": "/oauth/app-callback" }],
          },
        ],
      },
    });
  });

  it("is absent when nothing valid is configured", () => {
    expect(appleAppSiteAssociation({})).toBeNull();
    expect(appleAppSiteAssociation({ APPLE_APP_IDS: "lol.tomomai.app" })).toBeNull();
  });
});

describe("androidAssetLinks", () => {
  it("lists the package with its signing fingerprints", () => {
    expect(
      androidAssetLinks({ ANDROID_APP_PACKAGE: "lol.tomomai.app", ANDROID_APP_SHA256_FINGERPRINTS: FINGERPRINT.toLowerCase() }),
    ).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "lol.tomomai.app", sha256_cert_fingerprints: [FINGERPRINT] },
      },
    ]);
  });

  it.each([
    ["no package", { ANDROID_APP_SHA256_FINGERPRINTS: FINGERPRINT }],
    ["no fingerprint", { ANDROID_APP_PACKAGE: "lol.tomomai.app" }],
    ["a malformed package", { ANDROID_APP_PACKAGE: "tomomai", ANDROID_APP_SHA256_FINGERPRINTS: FINGERPRINT }],
    ["a malformed fingerprint", { ANDROID_APP_PACKAGE: "lol.tomomai.app", ANDROID_APP_SHA256_FINGERPRINTS: "AA:BB" }],
  ])("is absent with %s", (_name, env) => {
    expect(androidAssetLinks(env)).toBeNull();
  });
});

describe("appLinkResponse", () => {
  it("answers 404 for an absent file", () => {
    expect(appLinkResponse(null).status).toBe(404);
  });

  it("serves JSON that can be cached", async () => {
    const response = appLinkResponse({ ok: true });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toContain("max-age=3600");
    expect(await response.json()).toEqual({ ok: true });
  });
});
