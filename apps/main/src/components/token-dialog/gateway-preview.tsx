import { BrandLogo } from "@/components/brand-logo";
import { SEGA_AIME_GATEWAY } from "@/lib/games/sites";
import { matchLocale, panelMessages, type Messages } from "@tomomai/userscript/i18n";
import { useGame } from "@/components/providers/game-provider";
import { Cookie, MousePointer2, Send, X } from "lucide-react";
import { useLocale } from "next-intl";

/** The userscript panel's strings for this site's game, in the language it picks up from the site. */
export function usePanelMessages(): Messages {
  const { brand } = useGame();
  return panelMessages(matchLocale(useLocale()) ?? "en", { product: brand.productName, netName: brand.netName });
}

/**
 * A picture of the userscript's panel on the gateway page, so the send step shows what to look for, with
 * the panel's own strings. Radii are fixed rather than theme sizes, which are made for full-size cards
 * and look bloated at this scale.
 */
export function GatewayPreview() {
  const panel = usePanelMessages();
  return (
    <div aria-hidden className="overflow-hidden rounded-[12px] border select-none">
      <div className="flex items-center gap-1.5 border-b bg-muted px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-foreground/15" />
        <span className="h-2 w-2 rounded-full bg-foreground/15" />
        <span className="h-2 w-2 rounded-full bg-foreground/15" />
        <span className="ml-2 min-w-0 flex-1 truncate rounded-[6px] bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground">
          {SEGA_AIME_GATEWAY.landingUrl.replace("https://", "")}
        </span>
      </div>
      {/* SEGA's page is light whatever tomomai's theme is, so it is drawn in fixed colors. */}
      <div className="relative grid place-items-center overflow-hidden bg-[#f4f4f5] px-4 pt-9 pb-11">
        <div className="absolute inset-0 blur-[2px]">
          <div className="mx-auto mt-4 w-3/4 rounded-[6px] bg-white p-3">
            <div className="rounded-[3px] bg-[#fde8ea] px-2 py-1 text-[10px] text-[#3f3f46]">Not found</div>
            <div className="mx-auto mt-3 h-4 w-1/3 rounded-full bg-[#a1a1aa]" />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-8 bg-[#1a7fe8]" />
        </div>
        <div className="absolute inset-0 bg-black/25" />
        <div className="relative w-60 rounded-[18px] border bg-card p-3.5 shadow-lg">
          <div className="flex items-center justify-between">
            <BrandLogo section="dashboard" height={20} />
            <X className="h-3 w-3 text-muted-foreground" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-muted text-primary">
              <Cookie className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-semibold">{panel.readyTitle}</span>
          </div>
          <div className="relative mt-3 flex h-7 items-center justify-center gap-1.5 rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
            <Send className="h-3 w-3" />
            {panel.send}
            <MousePointer2 className="absolute -bottom-2.5 right-8 h-4 w-4 fill-foreground stroke-background" />
          </div>
        </div>
      </div>
    </div>
  );
}
