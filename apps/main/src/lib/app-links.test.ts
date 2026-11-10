import { describe, expect, it } from "vitest";
import { androidAssetLinks, appLinkResponse, appStoreLinks, appleAppSiteAssociation } from "./app-links";

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
      webcredentials: { apps: ["ABCDE12345.lol.tomomai.app", "ABCDE12345.lol.tomomai.app.dev"] },
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

describe("appStoreLinks", () => {
  const STORES = { APP_STORE_URL: "https://apps.apple.com/app/id1", PLAY_STORE_URL: "https://play.google.com/store/apps/details?id=lol.tomomai.app" };
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
  const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9)";
  const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

  it.each([
    ["an iPhone", IPHONE, ["appStore"]],
    ["an Android phone", ANDROID, ["playStore"]],
    ["a desktop", DESKTOP, ["appStore", "playStore"]],
  ])("offers %s its own store", (_name, userAgent, stores) => {
    expect(appStoreLinks(userAgent, STORES).map((link) => link.store)).toEqual(stores);
  });

  it("falls back to every listing when the phone's own store is not configured", () => {
    expect(appStoreLinks(ANDROID, { APP_STORE_URL: STORES.APP_STORE_URL }).map((link) => link.store)).toEqual(["appStore"]);
  });

  it("offers nothing until a valid https listing is configured", () => {
    expect(appStoreLinks(IPHONE, {})).toEqual([]);
    expect(appStoreLinks(IPHONE, { APP_STORE_URL: "http://apps.apple.com/app/id1", PLAY_STORE_URL: "not a url" })).toEqual([]);
  });
});
