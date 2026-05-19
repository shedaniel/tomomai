"use client";

import { useState } from "react";

interface CodeSamplesProps {
  method: string;
  url: string;
  needsAuth: boolean;
}

type Lang = "curl" | "fetch" | "python";

export function CodeSamples({ method, url, needsAuth }: CodeSamplesProps) {
  const [lang, setLang] = useState<Lang>("curl");
  const [copied, setCopied] = useState(false);

  const snippet = renderSnippet(lang, method, url, needsAuth);

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex gap-1">
          {(["curl", "fetch", "python"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={
                "rounded px-2 py-0.5 text-xs " +
                (lang === l
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {l}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {copied ? "copied!" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs">
        <code>{snippet}</code>
      </pre>
    </div>
  );
}

function renderSnippet(lang: Lang, method: string, url: string, needsAuth: boolean): string {
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
  // python
  const headerLine = authHeader ? `, headers={"Authorization": "Bearer tmk_<your-key>"}` : "";
  return `import requests\nres = requests.${method.toLowerCase()}("${url}"${headerLine})\nres.raise_for_status()\ndata = res.json()`;
}
