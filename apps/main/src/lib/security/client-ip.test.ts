import { describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "@tomomai/security/rate-limit";

describe("clientIpFromHeaders", () => {
  it("prefers Vercel's protected client IP over proxy-supplied headers", () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "203.0.113.10",
      "cf-connecting-ip": "198.51.100.20",
      "x-forwarded-for": "192.0.2.30",
    });

    expect(clientIpFromHeaders(headers)).toBe("203.0.113.10");
  });

  it("uses Cloudflare's connecting IP before the forwarded chain", () => {
    const headers = new Headers({
      "cf-connecting-ip": "2001:db8::10",
      "x-forwarded-for": "192.0.2.30, 198.51.100.40",
    });

    expect(clientIpFromHeaders(headers)).toBe("2001:db8::10");
  });

  it("falls back to the first valid forwarded IP outside Vercel and Cloudflare", () => {
    const headers = new Headers({
      "x-forwarded-for": "192.0.2.30, 198.51.100.40",
    });

    expect(clientIpFromHeaders(headers)).toBe("192.0.2.30");
  });

  it("ignores malformed values instead of creating attacker-controlled Redis keys", () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "not-an-ip",
      "cf-connecting-ip": "also-not-an-ip",
      "x-forwarded-for": "still-not-an-ip",
    });

    expect(clientIpFromHeaders(headers)).toBe("unknown");
  });
});
