import { describe, expect, it } from "vitest";
import {
  confidentialClientViolation,
  isNativeRedirectUrl,
  nativeClientViolation,
  nativeRedirectHosts,
  nativeRedirectViolation,
} from "./oauth-native";

const HOSTS = ["tomomai.lol"];
const REDIRECT = "https://tomomai.lol/oauth/app-callback";

const nativeBody = {
  token_endpoint_auth_method: "none",
  type: "native",
  redirect_uris: [REDIRECT],
  grant_types: ["authorization_code"],
  metadata: { official: true },
};

describe("nativeRedirectHosts", () => {
  it("uses the configured list", () => {
    expect(nativeRedirectHosts(" Tomomai.lol , chu.tomomai.lol ", "https://other.example")).toEqual([
      "tomomai.lol",
      "chu.tomomai.lol",
    ]);
  });

  it("falls back to the deployment's host", () => {
    expect(nativeRedirectHosts(undefined, "https://tomomai.lol")).toEqual(["tomomai.lol"]);
    expect(nativeRedirectHosts("", "https://tomomai.lol:8443")).toEqual(["tomomai.lol:8443"]);
  });

  it("allows nothing when the base URL is unusable", () => {
    expect(nativeRedirectHosts(undefined, "not a url")).toEqual([]);
  });
});

describe("isNativeRedirectUrl", () => {
  it("accepts the callback on an allowlisted host", () => {
    expect(isNativeRedirectUrl(REDIRECT, HOSTS)).toBe(true);
  });

  it.each([
    ["http scheme", "http://tomomai.lol/oauth/app-callback"],
    ["custom scheme", "tomomai://oauth/app-callback"],
    ["other host", "https://evil.example/oauth/app-callback"],
    ["subdomain of an allowed host", "https://evil.tomomai.lol/oauth/app-callback"],
    ["other path", "https://tomomai.lol/oauth/consent"],
    ["trailing slash", "https://tomomai.lol/oauth/app-callback/"],
    ["query", "https://tomomai.lol/oauth/app-callback?next=/x"],
    ["fragment", "https://tomomai.lol/oauth/app-callback#x"],
    ["userinfo", "https://user:pass@tomomai.lol/oauth/app-callback"],
    ["other port", "https://tomomai.lol:8443/oauth/app-callback"],
    ["non-canonical spelling", "https://TOMOMAI.LOL:443/oauth/./app-callback"],
    ["not a string", 42],
  ])("rejects %s", (_name, value) => {
    expect(isNativeRedirectUrl(value, HOSTS)).toBe(false);
  });
});

describe("confidentialClientViolation", () => {
  it("accepts the shape the developer router creates", () => {
    expect(confidentialClientViolation({ token_endpoint_auth_method: "client_secret_basic" })).toBeNull();
    expect(confidentialClientViolation({ type: "web" })).toBeNull();
    expect(confidentialClientViolation({})).toBeNull();
  });

  it("refuses public and non-web clients", () => {
    expect(confidentialClientViolation({ token_endpoint_auth_method: "none" })).not.toBeNull();
    expect(confidentialClientViolation({ type: "native" })).not.toBeNull();
    expect(confidentialClientViolation({ type: "user-agent-based" })).not.toBeNull();
  });
});

describe("nativeClientViolation", () => {
  it("accepts an official native client with a callback redirect", () => {
    expect(nativeClientViolation(nativeBody, HOSTS)).toBeNull();
    expect(nativeClientViolation({ ...nativeBody, grant_types: ["authorization_code", "refresh_token"] }, HOSTS)).toBeNull();
  });

  it.each([
    ["a secret-based method", { token_endpoint_auth_method: "client_secret_basic" }],
    ["type web", { type: "web" }],
    ["skip_consent", { skip_consent: true }],
    ["disabled PKCE", { require_pkce: false }],
    ["client_credentials", { grant_types: ["client_credentials"] }],
    ["no official flag", { metadata: {} }],
    ["official false", { metadata: { official: false } }],
    ["no metadata", { metadata: undefined }],
    ["no redirect", { redirect_uris: [] }],
    ["a foreign redirect", { redirect_uris: [REDIRECT, "https://evil.example/oauth/app-callback"] }],
  ])("rejects %s", (_name, override) => {
    expect(nativeClientViolation({ ...nativeBody, ...override }, HOSTS)).not.toBeNull();
  });
});

describe("nativeRedirectViolation", () => {
  it("needs at least one redirect", () => {
    expect(nativeRedirectViolation(undefined, HOSTS)).not.toBeNull();
    expect(nativeRedirectViolation([], HOSTS)).not.toBeNull();
    expect(nativeRedirectViolation([REDIRECT], HOSTS)).toBeNull();
  });
});
