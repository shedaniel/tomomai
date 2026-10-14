"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, Tabs, TabsList, TabsTrigger, TabsContent } from "@tomomai/ui";
import type { SampleLang } from "@/lib/developer/code-samples";
import { HighlightedCode } from "./highlighted-code";

export interface CodeSample {
  lang: SampleLang;
  code: string;
  html: string;
}

export function CodeSamples({ samples }: { samples: CodeSample[] }) {
  const [lang, setLang] = useState<SampleLang>(samples[0].lang);
  const [copied, setCopied] = useState(false);

  const snippet = samples.find((s) => s.lang === lang)?.code ?? "";

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <Tabs value={lang} onValueChange={(v) => setLang(v as SampleLang)}>
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <TabsList className="h-8">
            {samples.map((s) => (
              <TabsTrigger key={s.lang} value={s.lang} className="text-xs">{s.lang}</TabsTrigger>
            ))}
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
        {samples.map((s) => (
          <TabsContent key={s.lang} value={s.lang} className="mt-0">
            <HighlightedCode html={s.html} className="[&_pre]:p-3" />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
