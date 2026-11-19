import { describe, expect, it } from "vitest";
import {
  confidentialClientViolation,
  isPublicRedirectUrl,
  publicClientUpdateViolation,
  publicClientViolation,
  publicRedirectHosts,
  publicRedirectViolation,
} from "./oauth-public";

const HOSTS = ["tomomai.lol"];
const REDIRECT = "https://tomomai.lol/oauth/app-callback";
const BROWSER_REDIRECT = "https://tomomai.lol/userscript/callback";

const nativeBody = {
  token_endpoint_auth_method: "none",
  type: "native",
  redirect_uris: [REDIRECT],
  grant_types: ["authorization_code"],
  metadata: { official: true },
};
const browserBody = { ...nativeBody, type: "user-agent-based", redirect_uris: [BROWSER_REDIRECT] };

describe("publicRedirectHosts", () => {
  it("uses the configured list", () => {
    expect(publicRedirectHosts("native", " Tomomai.lol , chu.tomomai.lol ", "https://other.example")).toEqual([
      "tomomai.lol",
      "chu.tomomai.lol",
    ]);
  });

  it("falls back to the deployment's host", () => {
    expect(publicRedirectHosts("native", undefined, "https://tomomai.lol")).toEqual(["tomomai.lol"]);
    expect(publicRedirectHosts("native", "", "https://tomomai.lol:8443")).toEqual(["tomomai.lol:8443"]);
  });

  it("allows nothing for a native client when the base URL is unusable", () => {
    expect(publicRedirectHosts("native", undefined, "not a url")).toEqual([]);
  });

  it("adds every game's site for a browser client", () => {
    expect(publicRedirectHosts("user-agent-based", undefined, "http://localhost:3000")).toEqual([
      "localhost:3000",
      "tomomai.lol",
      "chu.tomochu.lol",
    ]);
    expect(publicRedirectHosts("user-agent-based", "tomomai.lol", "https://other.example")).toEqual([
      "tomomai.lol",
      "chu.tomochu.lol",
    ]);
  });
});

describe("isPublicRedirectUrl", () => {
  it("accepts the app link callback for a native client", () => {
    expect(isPublicRedirectUrl(REDIRECT, "native", HOSTS)).toBe(true);
  });

  it("accepts another path for a browser client", () => {
    expect(isPublicRedirectUrl(BROWSER_REDIRECT, "user-agent-based", HOSTS)).toBe(true);
  });

  it("allows http on a loopback host only in development", () => {
    const local = "http://localhost:3000/userscript/callback";
    expect(isPublicRedirectUrl(local, "user-agent-based", ["localhost:3000"], true)).toBe(true);
    expect(isPublicRedirectUrl(local, "user-agent-based", ["localhost:3000"], false)).toBe(false);
    expect(isPublicRedirectUrl("http://tomomai.lol/userscript/callback", "user-agent-based", HOSTS, true)).toBe(false);
  });

  it("keeps each type to its own paths", () => {
    expect(isPublicRedirectUrl(BROWSER_REDIRECT, "native", HOSTS)).toBe(false);
    expect(isPublicRedirectUrl(REDIRECT, "user-agent-based", HOSTS)).toBe(false);
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
  ])("rejects %s for a native client", (_name, value) => {
    expect(isPublicRedirectUrl(value, "native", HOSTS)).toBe(false);
  });

  it.each([
    ["http scheme", "http://tomomai.lol/userscript/callback"],
    ["other host", "https://evil.example/userscript/callback"],
    ["query", "https://tomomai.lol/userscript/callback?next=/x"],
    ["fragment", "https://tomomai.lol/userscript/callback#x"],
    ["userinfo", "https://user:pass@tomomai.lol/userscript/callback"],
    ["non-canonical spelling", "https://tomomai.lol/userscript/../userscript/callback"],
  ])("rejects %s for a browser client", (_name, value) => {
    expect(isPublicRedirectUrl(value, "user-agent-based", HOSTS)).toBe(false);
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

describe("publicClientViolation", () => {
  it("accepts an official native client with a callback redirect", () => {
    expect(publicClientViolation(nativeBody, HOSTS)).toBeNull();
    expect(publicClientViolation({ ...nativeBody, grant_types: ["authorization_code", "refresh_token"] }, HOSTS)).toBeNull();
  });

  it("accepts an official browser client with its own redirect", () => {
    expect(publicClientViolation(browserBody, HOSTS)).toBeNull();
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
    expect(publicClientViolation({ ...nativeBody, ...override }, HOSTS)).not.toBeNull();
  });

  it("rejects a browser client on the app link callback", () => {
    expect(publicClientViolation({ ...browserBody, redirect_uris: [REDIRECT] }, HOSTS)).not.toBeNull();
  });
});

describe("publicClientUpdateViolation", () => {
  it("allows an update that keeps the client's rules", () => {
    expect(publicClientUpdateViolation("native", { client_name: "App" }, HOSTS)).toBeNull();
    expect(publicClientUpdateViolation("native", { type: "native", redirect_uris: [REDIRECT] }, HOSTS)).toBeNull();
    expect(publicClientUpdateViolation("user-agent-based", { redirect_uris: [BROWSER_REDIRECT] }, HOSTS)).toBeNull();
  });

  it.each([
    ["a type change", { type: "user-agent-based" }],
    ["a secret", { token_endpoint_auth_method: "client_secret_basic" }],
    ["client_credentials", { grant_types: ["authorization_code", "client_credentials"] }],
    ["a redirect outside its rule", { redirect_uris: [BROWSER_REDIRECT] }],
  ])("rejects %s", (_name, update) => {
    expect(publicClientUpdateViolation("native", update, HOSTS)).not.toBeNull();
  });
});

describe("publicRedirectViolation", () => {
  it("needs at least one redirect", () => {
    expect(publicRedirectViolation("native", undefined, HOSTS)).not.toBeNull();
    expect(publicRedirectViolation("native", [], HOSTS)).not.toBeNull();
    expect(publicRedirectViolation("native", [REDIRECT], HOSTS)).toBeNull();
  });
});
