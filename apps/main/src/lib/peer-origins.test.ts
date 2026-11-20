import { describe, expect, it } from "vitest";
import { peerOrigins } from "./peer-origins";

describe("peerOrigins", () => {
  it("reads each origin once, without paths", () => {
    expect(peerOrigins(" https://chu.example.test/ , https://other.example.test:8443/x,https://chu.example.test")).toEqual([
      "https://chu.example.test",
      "https://other.example.test:8443",
    ]);
  });

  it("is empty when unset and skips entries that are not URLs", () => {
    expect(peerOrigins(undefined)).toEqual([]);
    expect(peerOrigins("")).toEqual([]);
    expect(peerOrigins("chu.example.test,https://ok.example.test")).toEqual(["https://ok.example.test"]);
  });
});
