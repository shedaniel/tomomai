"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { useCommandPaletteActions } from "@/components/command-palette/command-palette-provider";
import type { PaletteItem } from "@/components/command-palette/types";
import { resolveBaseUrl } from "@/lib/base-url";
import type { Region } from "@/lib/games/ids";

/** Offers the viewed profile's link in the command palette. */
export function ProfilePaletteActions({ username, region }: { username: string; region: Region }) {
  const t = useTranslations("commandPalette.actions");
  const actions = useMemo<PaletteItem[]>(() => [{
    id: "profile:copy-link",
    group: "actions",
    title: t("copyThisProfileLink", { username }),
    icon: Link2,
    keywords: ["share", "profile", "link", "url", username],
    perform: () => {
      void navigator.clipboard.writeText(`${resolveBaseUrl()}/profile/${encodeURIComponent(username)}/${region}`)
        .then(() => toast.success(t("copiedProfileLink")), () => undefined);
    },
  }], [t, username, region]);
  useCommandPaletteActions("profile", actions);
  return null;
}
