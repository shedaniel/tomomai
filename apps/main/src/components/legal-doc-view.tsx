import type { LegalDocument } from "@/lib/legal";

/**
 * Renders a policy document verbatim (plain text, whitespace preserved).
 * The source .txt already carries its own heading and "Last Updated" line, so
 * we display the content as-is rather than restyling it.
 */
export function LegalDocView({ doc }: { doc: LegalDocument }) {
  return (
    <main className="container mx-auto max-w-3xl flex-1 px-4 py-12">
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
        {doc.content}
      </div>
    </main>
  );
}
