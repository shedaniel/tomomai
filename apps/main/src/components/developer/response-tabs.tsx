"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@tomomai/ui";

type Tab = "schema" | "typescript" | "zod";

interface ResponseTabsProps {
  /** The rendered schema tree. */
  tree: ReactNode;
  typescript: string;
  zod: string;
}

export function ResponseTabs({ tree, typescript, zod }: ResponseTabsProps) {
  const [tab, setTab] = useState<Tab>("schema");
  const [copied, setCopied] = useState(false);
  const code = tab === "typescript" ? typescript : tab === "zod" ? zod : null;

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setCopied(false); }}>
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <TabsList className="h-8">
            <TabsTrigger value="schema" className="text-xs">Schema</TabsTrigger>
            <TabsTrigger value="typescript" className="text-xs">TypeScript</TabsTrigger>
            <TabsTrigger value="zod" className="text-xs">Zod</TabsTrigger>
          </TabsList>
          {code !== null && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => {
                navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          )}
        </div>
        <TabsContent value="schema" className="mt-0 overflow-x-auto p-4">
          {tree}
        </TabsContent>
        {([["typescript", typescript], ["zod", zod]] as const).map(([value, source]) => (
          <TabsContent key={value} value={value} className="mt-0">
            <pre className="overflow-x-auto p-4 text-xs">
              <code>{source}</code>
            </pre>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
