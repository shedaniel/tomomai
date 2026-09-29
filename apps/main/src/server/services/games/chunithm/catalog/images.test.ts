import { describe, expect, it } from "vitest";
import { chunithmImagePolicy } from "./images";
import { otogeDbUrl } from "@/server/services/catalog/sources/otoge-db";

const root = otogeDbUrl("chunithm");

describe("chunithmImagePolicy", () => {
  it("names jackets served from the otoge-db root", () => {
    expect(chunithmImagePolicy.extractFilename(`${root}/jacket/abc123.jpg`)).toBe("chunithm/abc123.jpg");
  });

  it("rejects other hosts, nested paths, queries and fragments", () => {
    for (const url of [
      "https://example.com/zvuc/otoge-db/main/chunithm/jacket/abc123.jpg",
      `${root}/data/music-ex.json`,
      `${root}/jacket/nested/abc123.jpg`,
      `${root}/jacket/abc123.jpg?raw=1`,
      `${root}/jacket/abc123.jpg#top`,
      `${root}/jacket/`,
    ]) {
      expect(chunithmImagePolicy.extractFilename(url)).toBeNull();
    }
  });
});
