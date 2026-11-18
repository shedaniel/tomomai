import { BrandLogo } from "@/components/brand-logo";
import { SEGA_AIME_GATEWAY } from "@/lib/games/sites";
import { Cookie, MousePointer2, Send } from "lucide-react";

/**
 * A picture of the userscript's panel on the gateway page, so the send step shows what to look for. Its
 * labels stay in English because the panel itself is English.
 */
export function GatewayPreview() {
  return (
    <div aria-hidden className="overflow-hidden rounded-2xl border select-none">
      <div className="flex items-center gap-1.5 border-b bg-muted px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-foreground/15" />
        <span className="h-2 w-2 rounded-full bg-foreground/15" />
        <span className="h-2 w-2 rounded-full bg-foreground/15" />
        <span className="ml-2 min-w-0 flex-1 truncate rounded-full bg-background/80 px-2.5 py-0.5 text-[10px] text-muted-foreground">
          {SEGA_AIME_GATEWAY.landingUrl.replace("https://", "")}
        </span>
      </div>
      {/* SEGA's page is light whatever tomomai's theme is, so it is drawn in fixed colors. */}
      <div className="relative grid place-items-center overflow-hidden bg-[#f4f4f5] px-4 pt-9 pb-11">
        <div className="absolute inset-0 blur-[2px]">
          <div className="mx-auto mt-4 w-3/4 rounded-lg bg-white p-3">
            <div className="rounded bg-[#fde8ea] px-2 py-1 text-[10px] text-[#3f3f46]">Not found</div>
            <div className="mx-auto mt-3 h-4 w-1/3 rounded-full bg-[#a1a1aa]" />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-8 bg-[#1a7fe8]" />
        </div>
        <div className="absolute inset-0 bg-black/25" />
        <div className="relative w-60 rounded-3xl border bg-card p-3.5 shadow-xl">
          <BrandLogo section="dashboard" height={20} />
          <div className="mt-3 flex items-center gap-2">
            <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-muted text-primary">
              <Cookie className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-semibold">Ready to send</span>
          </div>
          <div className="relative mt-3 flex h-8 items-center justify-center gap-1.5 rounded-full bg-primary text-[11px] font-medium text-primary-foreground ring-4 ring-primary/20">
            <Send className="h-3 w-3" />
            Send to tomomai
            <MousePointer2 className="absolute -bottom-3 right-7 h-5 w-5 fill-foreground stroke-background" />
          </div>
        </div>
      </div>
    </div>
  );
}
