import { describe, expect, it } from "vitest";
import { fetchPublicImage, isPublicAddress } from "./public-image";

describe("isPublicAddress", () => {
  it("accepts public addresses", () => {
    for (const ip of ["1.1.1.1", "104.16.0.1", "2606:4700::1111"]) expect(isPublicAddress(ip)).toBe(true);
  });

  it("rejects loopback, private, link-local and reserved addresses", () => {
    for (const ip of [
      "127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.1", "169.254.169.254", "100.64.0.1",
      "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip",
    ]) expect(isPublicAddress(ip)).toBe(false);
  });
});

describe("fetchPublicImage", () => {
  it("refuses non-https and private IP-literal URLs before connecting", async () => {
    for (const url of ["http://example.com/a.png", "https://127.0.0.1/a.png", "https://[::1]/a.png", "https://u:p@example.com/a.png"]) {
      await expect(fetchPublicImage(url)).rejects.toThrow("not a public https URL");
    }
  });
});
