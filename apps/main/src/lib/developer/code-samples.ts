export const SAMPLE_LANGS = ["curl", "fetch", "python"] as const;
export type SampleLang = (typeof SAMPLE_LANGS)[number];

export const SAMPLE_HIGHLIGHT = { curl: "bash", fetch: "javascript", python: "python" } as const;

/** A JSON request body for a sample, with a placeholder for each field. */
export type SampleBody = Record<string, string>;

export function renderSnippet(lang: SampleLang, method: string, url: string, needsAuth: boolean, body?: SampleBody): string {
  const authHeader = needsAuth ? "Authorization: Bearer tmk_<your-key>" : null;
  const json = body ? JSON.stringify(body) : null;

  if (lang === "curl") {
    let cmd = `curl ${method === "GET" ? "" : `-X ${method} `}"${url}"`;
    if (authHeader) cmd += ` \\\n  -H "${authHeader}"`;
    if (json) cmd += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${json}'`;
    return cmd;
  }
  if (lang === "fetch") {
    const headerEntries = [
      ...(authHeader ? [`Authorization: "Bearer tmk_<your-key>"`] : []),
      ...(json ? [`"Content-Type": "application/json"`] : []),
    ];
    const lines = [
      ...(method !== "GET" ? [`  method: "${method}",`] : []),
      ...(headerEntries.length ? [`  headers: { ${headerEntries.join(", ")} },`] : []),
      ...(json ? [`  body: JSON.stringify(${jsObject(body!)}),`] : []),
    ];
    return lines.length
      ? `const res = await fetch("${url}", {\n${lines.join("\n")}\n});\nconst data = await res.json();`
      : `const res = await fetch("${url}");\nconst data = await res.json();`;
  }
  const headerLine = authHeader ? `, headers={"Authorization": "Bearer tmk_<your-key>"}` : "";
  const jsonLine = body ? `, json=${pyDict(body)}` : "";
  return `import requests\nres = requests.${method.toLowerCase()}("${url}"${headerLine}${jsonLine})\nres.raise_for_status()\ndata = res.json()`;
}

function jsObject(body: SampleBody): string {
  return `{ ${Object.entries(body).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(", ")} }`;
}

function pyDict(body: SampleBody): string {
  return `{${Object.entries(body).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(", ")}}`;
}
