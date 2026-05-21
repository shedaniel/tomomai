"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, Tabs, TabsList, TabsTrigger, TabsContent } from "@tomomai/ui";

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
      <Tabs value={lang} onValueChange={(v) => setLang(v as Lang)}>
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <TabsList className="h-8">
            <TabsTrigger value="curl" className="text-xs">curl</TabsTrigger>
            <TabsTrigger value="fetch" className="text-xs">fetch</TabsTrigger>
            <TabsTrigger value="python" className="text-xs">python</TabsTrigger>
          </TabsList>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => {
              navigator.clipboard.writeText(snippet);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        {(["curl", "fetch", "python"] as const).map((l) => (
          <TabsContent key={l} value={l} className="mt-0">
            <pre className="overflow-x-auto p-3 text-xs">
              <code>{renderSnippet(l, method, url, needsAuth)}</code>
            </pre>
          </TabsContent>
        ))}
      </Tabs>
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
  const headerLine = authHeader ? `, headers={"Authorization": "Bearer tmk_<your-key>"}` : "";
  return `import requests\nres = requests.${method.toLowerCase()}("${url}"${headerLine})\nres.raise_for_status()\ndata = res.json()`;
}
