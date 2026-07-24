import { describe, expect, it } from "vitest";
import { measureMarkdown, validateMarkdownSize } from "./size";

describe("Markdown size limits", () => {
  it("counts Unicode code points and UTF-8 bytes independently", () => {
    expect(measureMarkdown("A😀界")).toEqual({ characters: 3, utf8Bytes: 8 });
    expect(measureMarkdown("e\u0301")).toEqual({ characters: 2, utf8Bytes: 3 });
  });

  it("accepts exact boundaries", () => {
    expect(validateMarkdownSize("界界", { maxCharacters: 2, maxUtf8Bytes: 6 })).toEqual({
      ok: true,
      size: { characters: 2, utf8Bytes: 6 },
    });
  });

  it("reports each independent exceeded limit with character precedence", () => {
    expect(validateMarkdownSize("abc", { maxCharacters: 2, maxUtf8Bytes: 100 })).toMatchObject({
      ok: false,
      exceeded: "characters",
    });
    expect(validateMarkdownSize("😀😀", { maxCharacters: 2, maxUtf8Bytes: 7 })).toMatchObject({
      ok: false,
      exceeded: "bytes",
    });
    expect(validateMarkdownSize("😀😀😀", { maxCharacters: 2, maxUtf8Bytes: 7 })).toMatchObject({
      ok: false,
      exceeded: "characters",
    });
  });
});
