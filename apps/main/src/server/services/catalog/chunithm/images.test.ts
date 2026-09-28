import { describe, expect, it } from "vitest";
import { chunithmImagePolicy } from "./images";
import { OTOGE_DB_CHUNITHM_ROOT } from "./sources/otoge-db";

describe("chunithmImagePolicy", () => {
  it("names jackets served from the otoge-db root", () => {
    expect(chunithmImagePolicy.extractFilename(`${OTOGE_DB_CHUNITHM_ROOT}/jacket/abc123.jpg`)).toBe("chunithm/abc123.jpg");
  });

  it("rejects other hosts, nested paths, queries and fragments", () => {
    for (const url of [
      "https://example.com/zvuc/otoge-db/main/chunithm/jacket/abc123.jpg",
      `${OTOGE_DB_CHUNITHM_ROOT}/data/music-ex.json`,
      `${OTOGE_DB_CHUNITHM_ROOT}/jacket/nested/abc123.jpg`,
      `${OTOGE_DB_CHUNITHM_ROOT}/jacket/abc123.jpg?raw=1`,
      `${OTOGE_DB_CHUNITHM_ROOT}/jacket/abc123.jpg#top`,
      `${OTOGE_DB_CHUNITHM_ROOT}/jacket/`,
    ]) {
      expect(chunithmImagePolicy.extractFilename(url)).toBeNull();
    }
  });
});
