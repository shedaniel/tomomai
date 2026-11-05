"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Kbd } from "@tomomai/ui";
import { useCommandPalette } from "./command-palette-provider";
import { useShortcutLabel } from "./command-palette";

/** The header's entry to the command palette: a search field look-alike on wide screens, an icon on phones. */
export function SearchButton() {
  const t = useTranslations("commandPalette");
  const { setOpen } = useCommandPalette();
  const shortcut = useShortcutLabel();
  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-8 w-52 justify-start gap-2 rounded-full bg-background/60 px-3 text-sm font-normal text-muted-foreground shadow-none hover:text-foreground max-lg:w-40 max-md:hidden"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">{t("button")}</span>
        <span className="flex items-center gap-0.5">{shortcut.map(key => <Kbd key={key}>{key}</Kbd>)}</span>
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={t("button")}
        className="size-10 rounded-full bg-background md:hidden"
      >
        <Search className="size-4" />
      </Button>
    </>
  );
}
