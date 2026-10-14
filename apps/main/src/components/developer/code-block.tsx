import { highlight, type CodeLang } from "@/lib/developer/highlight";
import { HighlightedCode } from "./highlighted-code";

export async function CodeBlock({ code, lang, className }: { code: string; lang: CodeLang; className?: string }) {
  return <HighlightedCode html={await highlight(code, lang)} className={className} />;
}
