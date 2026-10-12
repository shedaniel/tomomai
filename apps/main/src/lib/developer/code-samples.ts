export const SAMPLE_LANGS = ["curl", "fetch", "python"] as const;
export type SampleLang = (typeof SAMPLE_LANGS)[number];

export const SAMPLE_HIGHLIGHT = { curl: "bash", fetch: "javascript", python: "python" } as const;

export function renderSnippet(lang: SampleLang, method: string, url: string, needsAuth: boolean): string {
  const authHeader = needsAuth ? "Authorization: Bearer tmk_<your-key>" : null;

  if (lang === "curl") {
    let cmd = `curl ${method === "GET" ? "" : `-X ${method} `}"${url}"`;
    if (authHeader) cmd += ` \\\n  -H "${authHeader}"`;
    return cmd;
  }
  if (lang === "fetch") {
    const headers = authHeader
      ? `  headers: { Authorization: "Bearer tmk_<your-key>" },\n`
      : "";
    const opts = method !== "GET" || headers;
    return opts
      ? `const res = await fetch("${url}", {\n${method !== "GET" ? `  method: "${method}",\n` : ""}${headers}});\nconst data = await res.json();`
      : `const res = await fetch("${url}");\nconst data = await res.json();`;
  }
  const headerLine = authHeader ? `, headers={"Authorization": "Bearer tmk_<your-key>"}` : "";
  return `import requests\nres = requests.${method.toLowerCase()}("${url}"${headerLine})\nres.raise_for_status()\ndata = res.json()`;
}
