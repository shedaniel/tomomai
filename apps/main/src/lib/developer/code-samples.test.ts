import { describe, expect, it } from "vitest";
import { renderSnippet } from "./code-samples";

const URL = "https://tomomai.test/api/v1/games/<game>/fetch/token?region=intl";
const BODY = { clal: "<clal>" };

describe("renderSnippet", () => {
  it("sends a JSON body with its content type", () => {
    expect(renderSnippet("curl", "PUT", URL, true, BODY)).toBe(
      `curl -X PUT "${URL}" \\\n  -H "Authorization: Bearer tmk_<your-key>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"clal":"<clal>"}'`,
    );
    expect(renderSnippet("fetch", "PUT", URL, true, BODY)).toBe(
      `const res = await fetch("${URL}", {\n  method: "PUT",\n  headers: { Authorization: "Bearer tmk_<your-key>", "Content-Type": "application/json" },\n  body: JSON.stringify({ clal: "<clal>" }),\n});\nconst data = await res.json();`,
    );
    expect(renderSnippet("python", "PUT", URL, true, BODY)).toBe(
      `import requests\nres = requests.put("${URL}", headers={"Authorization": "Bearer tmk_<your-key>"}, json={"clal": "<clal>"})\nres.raise_for_status()\ndata = res.json()`,
    );
  });

  it("keeps samples without a body unchanged", () => {
    expect(renderSnippet("curl", "GET", URL, true)).toBe(`curl "${URL}" \\\n  -H "Authorization: Bearer tmk_<your-key>"`);
    expect(renderSnippet("fetch", "GET", URL, true)).toBe(
      `const res = await fetch("${URL}", {\n  headers: { Authorization: "Bearer tmk_<your-key>" },\n});\nconst data = await res.json();`,
    );
    expect(renderSnippet("fetch", "GET", URL, false)).toBe(`const res = await fetch("${URL}");\nconst data = await res.json();`);
  });
});
