import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveBaseUrl } from "./base-url";

const DEPLOYMENT_URLS = ["NEXT_PUBLIC_SITE_URL", "SITE_URL", "VERCEL_ENV", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_BRANCH_URL", "VERCEL_URL"];

beforeEach(() => {
  for (const name of DEPLOYMENT_URLS) vi.stubEnv(name, "");
});
afterEach(() => vi.unstubAllEnvs());

describe("base URL without a deployment URL", () => {
  it.each(["development", "production"])("follows the port the %s server listens on", env => {
    vi.stubEnv("NODE_ENV", env);
    vi.stubEnv("PORT", "3002");
    expect(resolveBaseUrl()).toBe("http://localhost:3002");
    vi.stubEnv("PORT", "");
    expect(resolveBaseUrl()).toBe("http://localhost:3000");
  });

  it("prefers a configured site URL over the port", () => {
    vi.stubEnv("PORT", "3002");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "tomochu.app/");
    expect(resolveBaseUrl()).toBe("https://tomochu.app");
  });
});
