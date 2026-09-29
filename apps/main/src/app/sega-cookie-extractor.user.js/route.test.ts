import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { GET as legacyGET } from "../maimai-cookie-extractor.user.js/route";

describe("SEGA cookie extractor userscript", () => {
  it("downloads under the SEGA name and points updates at the new path on the requesting host", async () => {
    const response = await GET(new Request("https://tomomai.lol/sega-cookie-extractor.user.js", { headers: { "x-forwarded-host": "tomomai.lol" } }));
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="sega-cookie-extractor.user.js"');
    const script = await response.text();
    expect(script).toContain("// @updateURL    https://tomomai.lol/sega-cookie-extractor.user.js\n");
    expect(script).toContain("// @downloadURL  https://tomomai.lol/sega-cookie-extractor.user.js\n");
    expect(script).toContain("// @version      1.2\n");
  });

  it("keeps serving the same script at the old maimai path for installed copies", () => {
    expect(legacyGET).toBe(GET);
  });
});
